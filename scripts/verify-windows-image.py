from pathlib import Path
import ctypes
import hashlib
import json
import os
import struct
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
exe = root / 'artifacts/Drone-Weather-Lab-0.89-Beta.exe'
data = exe.read_bytes()
pe = struct.unpack_from('<I', data, 60)[0]
assert data[:2] == b'MZ' and data[pe:pe+4] == b'PE\0\0'
assert struct.unpack_from('<H', data, pe+4)[0] == 0x8664
optional = pe + 24
assert struct.unpack_from('<H', data, optional)[0] == 0x20b
base = struct.unpack_from('<Q', data, optional+24)[0]
size = struct.unpack_from('<I', data, optional+56)[0]
entry = struct.unpack_from('<I', data, optional+16)[0]
libc = ctypes.CDLL(None)
libc.mmap.restype = ctypes.c_void_p
libc.mmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_long]
libc.mprotect.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int]
address = libc.mmap(base, size, 3, 0x100022, -1, 0)
assert address == base, 'Preferred address is unavailable; Windows loader was not tested'
ctypes.memmove(base, data[:struct.unpack_from('<I', data, optional+60)[0]], struct.unpack_from('<I', data, optional+60)[0])
sections = pe + 24 + struct.unpack_from('<H', data, pe+20)[0]
for i in range(struct.unpack_from('<H', data, pe+6)[0]):
    at = sections + i*40
    virtual_size, rva, raw_size, raw = struct.unpack_from('<IIII', data, at+8)
    if raw_size:
        ctypes.memmove(base+rva, data[raw:raw+raw_size], raw_size)
    flags = struct.unpack_from('<I', data, at+36)[0]
    permissions = (1 if flags & 0x40000000 else 0) | (2 if flags & 0x80000000 else 0) | (4 if flags & 0x20000000 else 0)
    mapped_size = ((max(virtual_size, raw_size)+4095)//4096)*4096
    if mapped_size:
        assert libc.mprotect(base+rva, mapped_size, permissions) == 0
output = root / 'artifacts/win-api-test.so'
subprocess.run(['gcc','-shared','-fPIC','-O2','-maccumulate-outgoing-args',str(root/'desktop/win-api-test.c'),'-o',str(output)],check=True)
shim = ctypes.CDLL(str(output))
shim.invokeLauncher.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
shim.launchPath.restype = ctypes.c_char_p
imports = []
import_rva = struct.unpack_from('<I', data, optional+120)[0]
def cstring(address):
    return ctypes.string_at(address).decode('ascii')
at = base+import_rva
while ctypes.c_uint32.from_address(at+12).value:
    lookup = ctypes.c_uint32.from_address(at).value
    library = cstring(base+ctypes.c_uint32.from_address(at+12).value)
    iat = ctypes.c_uint32.from_address(at+16).value
    index = 0
    while ctypes.c_uint64.from_address(base+lookup+index*8).value:
        hint = ctypes.c_uint64.from_address(base+lookup+index*8).value
        assert not hint & (1 << 63)
        name = cstring(base+hint+2)
        ctypes.c_uint64.from_address(base+iat+index*8).value = ctypes.cast(getattr(shim,name),ctypes.c_void_p).value
        imports.append(library+':'+name)
        index += 1
    at += 20
html = (root/'Drone-Weather-Lab-0.89-Beta.html').read_bytes()
with tempfile.TemporaryDirectory(prefix='drone-launcher-') as folder:
    os.environ['DRONE_LAUNCHER_TEST_DIR'] = folder
    assert shim.invokeLauncher(base+entry,1,0) == 0
    extracted = Path(folder)/'DroneWeatherLab-0.89-Beta/Drone-Weather-Lab-0.89-Beta.html'
    assert extracted.read_bytes() == html
    assert shim.launchCount() == 0
    assert shim.invokeLauncher(base+entry,0,0) == 0
    assert shim.launchCount() == 1
    assert Path(shim.launchPath().decode()) == extracted
    assert shim.invokeLauncher(base+entry,1,1) == 1
    assert shim.launchCount() == 0
report = {'version':'0.87.0-beta','format':'PE32+ Windows x64','payloadSha256':hashlib.sha256(html).hexdigest(),'imports':imports,'checks':['actual PE entry executed with Linux WinAPI test shim','embedded HTML extraction matched byte for byte','partial writes completed','default-browser target checked with a ShellExecuteW test stub','write failure returned a nonzero exit code'],'windowsRuntimeTested':False}
(root/'verification-windows-v087.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
