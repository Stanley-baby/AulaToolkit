from pathlib import Path
import argparse, hashlib, json, struct, subprocess, tempfile
import patch_helpers as helpers
ROOT = Path(__file__).resolve().parent
BASE_SHA = 'ed95aa99b162b8f3746288c02bc04e403b21c86e1792f9c8cb662b1c6c2e8ab3'

def compile_source(name, work):
    subprocess.run(['clang', '--target=armv6m-none-eabi', '-mcpu=cortex-m0', '-mthumb', '-Oz', '-ffreestanding', '-fno-builtin', '-fno-unwind-tables', '-fno-asynchronous-unwind-tables', '-c', str(ROOT/(name+'.c')), '-o', str(work/(name+'.o'))], check=True)
    return helpers.sections((work/(name+'.o')).read_bytes())

def section(sections, name):
    index, _, code = sections['.text.'+name]
    assert code and not any(h[1] in (4,9) and h[7] == index and h[5] for _,h,_ in sections.values()), 'Unexpected unresolved relocation'
    return code

def build(output_path):
    source=(ROOT.parent.parent/'resources/firmware/S75Pro-F105.bin').read_bytes()
    assert len(source)==262144 and hashlib.sha256(source).hexdigest()==BASE_SHA
    before=json.loads((ROOT/'f105-manifest.json').read_text())
    with tempfile.TemporaryDirectory(prefix='s75pro-build-') as work_dir:
        work=Path(work_dir)
        code=compile_source('connected-dark', work)
        output=bytearray(source)
        hooks={}
        changes=[]
        cursor=0x1b000
        for at,name in [(0x77e,'hook_init'),(0x7c0,'hook_main_light'),(0x7c4,'hook_side_light'),(0x7c8,'hook_screen'),(0x7dc,'hook_idle')]:
            assert helpers.decode_bl(source,at)==before['hooks'][name]['address']
            body=section(code,name)
            cursor=(cursor+15)&~15
            assert cursor+len(body)<=0x1b800
            assert source[cursor:cursor+len(body)]==b'\xff'*len(body)
            output[cursor:cursor+len(body)]=body
            output[at:at+4]=helpers.encode_bl(at,cursor)
            hooks[name]={'address':cursor,'bytes':len(body)}
            changes.append({'offset':at,'hook':name,'before':source[at:at+4].hex(),'after':output[at:at+4].hex()})
            cursor+=len(body)
        reload=section(compile_source('custom-sleep', work),'reload')
        assert len(reload)<=512 and source[0x1b800:0x1b800+len(reload)]==b'\xff'*len(reload)
        assert source[0x46d0:0x46d8]==bytes.fromhex('004b184701a40100')
        output[0x46d0:0x46d8]=bytes.fromhex('004b1847')+struct.pack('<I',0x1b801)
        output[0x1b800:0x1b800+len(reload)]=reload
        for at in (0x8f88,0x13f30):
            assert struct.unpack_from('<H',source,at)[0]==0xf105
            struct.pack_into('<H',output,at,0xf106)
        allowed=set(range(0x1b000,cursor))|set(range(0x1b800,0x1b800+len(reload)))|set(range(0x46d0,0x46d8))|{0x8f88,0x8f89,0x13f30,0x13f31}
        for c in changes:allowed.update(range(c['offset'],c['offset']+4))
        assert all(a==b or i in allowed for i,(a,b) in enumerate(zip(source,output)))
        for a,b in [(0,0xc0),(0x187e,0x1924),(0x9000,0xb000),(0x194,0x2ec)]:assert output[a:b]==source[a:b]
        result={'kind':'F106-smart-sleep','baselineSha256':BASE_SHA,'sha256':hashlib.sha256(output).hexdigest(),'bytes':len(output),'checksum':sum(struct.unpack('<131072H',output))&65535,'release':0xf106,'hooks':hooks,'changes':changes,'reloadAddress':0x1b800,'reloadBytes':len(reload),'smartSelector':124,'darkMinutesFlash':0x9007,'deepMinutesFlash':0x9009,'thresholdRam':0x20007ff4,'changedBranch':'smart connected BT/2.4G closes lights/LCD at first timeout and delegates original194 at second; legacy deep/quick retained','hardwareStatus':'F106 image physically flashed and accepted on the tested S75 Pro revision'}
        assert result['sha256']=='5f8425131cf96e8878dee95950380b7fa788004e91540fbcf30b49d9b2ef2931', 'Compiler output differs from the reviewed F106 image'
        assert bytes(output)==(ROOT.parent.parent/'resources/firmware/S75Pro-F106.bin').read_bytes()
        output_path.parent.mkdir(parents=True,exist_ok=True)
        output_path.write_bytes(output)
        print(f'BUILT: {result["sha256"]}; checksum={result["checksum"]:04X}; release=F106')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Reproduce reviewed F106 from bundled F105; no device access')
    parser.add_argument('--output',type=Path,default=ROOT/'build/S75Pro-F106.bin')
    build(parser.parse_args().output)
