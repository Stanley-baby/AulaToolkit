from pathlib import Path
import argparse
import hashlib
import struct
import subprocess
import tempfile
import patch_helpers as helpers
from build import section

ROOT = Path(__file__).resolve().parent
RESOURCES = ROOT.parent.parent / 'resources/firmware'
BASE_SHA = '5f8425131cf96e8878dee95950380b7fa788004e91540fbcf30b49d9b2ef2931'
F108_SHA = '63e953f39bf07d33975e51aa27f985ad940252d642927506a9953c9f7104ebc7'
CALLS = [
    (0x77e, 0x1b000, 'wired_init'),
    (0x7c0, 0x1b020, 'wired_main_light'),
    (0x7c4, 0x1b0a0, 'wired_side_light'),
    (0x7c8, 0x1b0c0, 'wired_screen'),
    (0x7e2, 0x2ec, 'wired_idle'),
    (0x3414, 0x46d0, 'wired_key'),
    (0x352, 0x7eaa, 'wired_suspend'),
    (0x36a, 0x7ed4, 'wired_usb_restore'),
]


def compile_source(name, work):
    obj = work / (name + '.o')
    subprocess.run([
        'clang', '--target=armv6m-none-eabi', '-mcpu=cortex-m0', '-mthumb',
        '-Oz', '-ffreestanding', '-fno-builtin', '-fno-jump-tables',
        '-fno-unwind-tables', '-fno-asynchronous-unwind-tables',
        '-c', str(ROOT / (name + '.c')), '-o', str(obj),
    ], check=True)
    return helpers.sections(obj.read_bytes())


def build(output_path):
    source = (RESOURCES / 'S75Pro-F106.bin').read_bytes()
    assert len(source) == 262144 and hashlib.sha256(source).hexdigest() == BASE_SHA
    output = bytearray(source)
    allowed = set()
    with tempfile.TemporaryDirectory(prefix='s75pro-wired-build-') as work:
        sections = compile_source('wired-dark', Path(work))
        cursor, hooks = 0x1c000, {}
        # Retain the F107 layout so the released F108 matches the physically tested image.
        for name in [name for _, _, name in CALLS] + ['wired_reload']:
            body = section(sections, name)
            cursor = (cursor + 15) & ~15
            assert cursor + len(body) <= 0x1d000
            assert source[cursor:cursor + len(body)] == b'\xff' * len(body)
            output[cursor:cursor + len(body)] = body
            allowed.update(range(cursor, cursor + len(body)))
            hooks[name] = cursor
            cursor += len(body)
        for at, expected, name in CALLS:
            assert helpers.decode_bl(source, at) == expected
            output[at:at + 4] = helpers.encode_bl(at, hooks[name])
            allowed.update(range(at, at + 4))
        assert source[0x46d0:0x46d8] == bytes.fromhex('004b184701b80100')
        struct.pack_into('<I', output, 0x46d4, hooks['wired_reload'] | 1)
        allowed.update(range(0x46d4, 0x46d8))
        restore = section(compile_source('usb-restore', Path(work)), 'usb_restore')
        assert len(restore) <= 0x400 and source[0x1d000:0x1d000 + len(restore)] == b'\xff' * len(restore)
        output[0x1d000:0x1d000 + len(restore)] = restore
        output[0x36a:0x36e] = helpers.encode_bl(0x36a, 0x1d000)
        allowed.update(range(0x1d000, 0x1d000 + len(restore)))
        for at in (0x8f88, 0x13f30):
            assert struct.unpack_from('<H', source, at)[0] == 0xf106
            struct.pack_into('<H', output, at, 0xf108)
            allowed.update(range(at, at + 2))
    assert all(a == b or i in allowed for i, (a, b) in enumerate(zip(source, output)))
    for start, end in [(0, 0xc0), (0x194, 0x2ec), (0x7dc, 0x7e0),
                       (0x187e, 0x1924), (0x9000, 0xb000), (0x1b000, 0x1ba00)]:
        assert source[start:end] == output[start:end]
    assert hashlib.sha256(output).hexdigest() == F108_SHA, 'Compiler output differs from reviewed F108'
    assert output == (RESOURCES / 'S75Pro-F108.bin').read_bytes()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(output)
    print(f'BUILT: {F108_SHA}; checksum=D821; release=F108')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Reproduce reviewed F108 from bundled F106; no device access')
    parser.add_argument('--output', type=Path, default=ROOT / 'build/S75Pro-F108.bin')
    build(parser.parse_args().output)
