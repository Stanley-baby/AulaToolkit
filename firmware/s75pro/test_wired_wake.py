"""Execute the released MCU instructions; no keyboard access. Requires unicorn==2.1.4."""
from pathlib import Path
import hashlib
import struct
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS, UC_HOOK_CODE
from unicorn.arm_const import (
    UC_CPU_ARM_CORTEX_M0, UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC,
    UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2,
)
from patch_helpers import decode_bl, encode_bl

ROOT = Path(__file__).resolve().parent
DARK, REMAIN, STOP = 0x20007fe0, 0x20007fe4, 0x3f000


class Machine:
    def __init__(self, image, host_resumes=True):
        self.image, self.host_resumes = image, host_resumes
        self.mu = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
        self.mu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M0)
        for address, size in [(0, 0x40000), (0x20000000, 0x8000),
                              (0x40000000, 0x80000), (0xe000e000, 0x1000)]:
            self.mu.mem_map(address, size)
        self.mu.mem_write(0, image)
        self.calls, self.reports, self.busy = [], [], False
        self.externals = {
            0xb086, 0xdbb0, 0xe504, 0x104e0, 0x7eaa, 0x7ed4,
            0x7f78, 0x96e, 0x131d0, 0x131f0, 0x6460, 0x3b70, 0x3c10,
            0xb498, 0x13284, 0x13114, 0x3bec, 0x6f8c, 0x4622,
            0xd92, 0x7f4c, 0x106e, 0xec4,
        }
        self.mu.hook_add(UC_HOOK_CODE, self.step)
        self.put(0x200000f7, 1)
        self.put(0x200000fa, 1)

    def put(self, at, value, size=1):
        self.mu.mem_write(at, value.to_bytes(size, 'little'))

    def get(self, at, size=1):
        return int.from_bytes(self.mu.mem_read(at, size), 'little')

    def step(self, mu, address, size, data):
        if address == STOP:
            mu.emu_stop()
        elif address == 0xa68:
            if not self.busy:
                report, pointer, length = [mu.reg_read(r) for r in (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2)]
                self.reports.append((report, bytes(mu.mem_read(pointer, length))))
            mu.reg_write(UC_ARM_REG_R0, 1 if self.busy else 0)
            mu.reg_write(UC_ARM_REG_PC, mu.reg_read(UC_ARM_REG_LR))
        elif address in self.externals:
            self.calls.append(address)
            mu.reg_write(UC_ARM_REG_PC, mu.reg_read(UC_ARM_REG_LR))
        elif address == 0x109a:
            self.calls.append(address)
        elif address == 0x1104:
            # Resume IRQ precedes the stock instruction after WFI that sets the latch.
            self.put(0x200000b8, 0)
            self.put(0x4005c004, 0 if self.host_resumes else 0x40000000, 4)
            mu.reg_write(UC_ARM_REG_PC, (address + 2) | 1)

    def call(self, address):
        self.mu.reg_write(UC_ARM_REG_SP, 0x20002e60)
        self.mu.reg_write(UC_ARM_REG_LR, STOP | 1)
        self.mu.emu_start(address | 1, STOP, count=100000)
        assert self.mu.reg_read(UC_ARM_REG_PC) == STOP
        assert self.mu.reg_read(UC_ARM_REG_SP) == 0x20002e60

    def tick(self):
        self.put(0x20000005, 1)
        self.call(decode_bl(self.image, 0x7e2))

    def render(self):
        for at in (0x7c0, 0x7c4, 0x7c8):
            self.call(decode_bl(self.image, at))

    def host_wake(self):
        self.put(0x20001344, 2, 4)
        self.put(0x20000118, 0, 2)
        self.call(0x2ec)

    def key(self):
        self.call(decode_bl(self.image, 0x3414))
        self.render()


def check(image):
    count = 0
    for selector in (1, 128, 124):
        m = Machine(image)
        m.put(0x200000fa, selector)
        m.put(0x9007, 1)
        m.put(0x9009, 60)
        m.call(0x46d0)
        m.host_wake()
        assert m.get(0x200000b8) == 0
        assert m.get(DARK) == 1, 'Host resume must not restore lighting'
        m.key()
        m.calls.clear()
        for _ in range(599):
            m.tick()
            m.render()
        assert m.get(DARK) == 0 and m.get(REMAIN, 4) == 1
        assert 0x109a not in m.calls and 0x7eaa not in m.calls
        m.tick()
        assert m.get(DARK) == 1 and m.calls.count(0x7eaa) == 1
        count += 1
    for active in (False, True):
        m = Machine(image, active)
        m.host_wake()
        assert m.get(0x200000b8) == (0 if active else 1)
        assert m.get(DARK) == 1
        count += 1
    m = Machine(image)
    for _ in range(3):
        m.host_wake()
        m.key()
        for usage in (4, 22, 7):  # asd
            m.key()
            payload = bytes([0, 0, usage, 0, 0, 0, 0, 0])
            m.mu.mem_write(0x200000a5, payload)
            m.put(0x2000005f, 1)
            m.busy = True
            m.tick()
            assert m.get(0x2000005f) == 1
            assert bytes(m.mu.mem_read(0x200000a5, 8)) == payload
            m.busy = False
            m.tick()
            assert m.get(0x2000005f) == 0 and m.reports[-1] == (1, payload)
        assert [p[1][2] for p in m.reports[-3:]] == [4, 22, 7]
        count += 1
    return count


if __name__ == '__main__':
    image = (ROOT.parent.parent / 'resources/firmware/S75Pro-F108.bin').read_bytes()
    assert hashlib.sha256(image).hexdigest() == '63e953f39bf07d33975e51aa27f985ad940252d642927506a9953c9f7104ebc7'
    baseline = bytearray(image)
    baseline[0x36a:0x36e] = encode_bl(0x36a, 0x1c540)
    baseline[0x1d000:0x1d038] = b'\xff' * 56
    for at in (0x8f88, 0x13f30):
        struct.pack_into('<H', baseline, at, 0xf107)
    assert hashlib.sha256(baseline).hexdigest() == 'ec3a79a17cc1b8ed75684450ba9e5ecb7f7ece505966a6e7b632548320c11e5b'
    m = Machine(bytes(baseline))
    m.call(0x46d0)
    m.host_wake()
    m.key()
    for _ in range(100):
        m.tick()
        m.render()
    assert m.get(DARK) == 1 and m.get(REMAIN, 4) == 500
    print('BASELINE: F107 reproduces second blackout at 10 seconds, with 50 seconds idle remaining')
    print(f'MODIFIED: PASS {check(image)} USB wake scenarios; no device accessed')
