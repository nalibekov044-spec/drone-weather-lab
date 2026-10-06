import ctypes as c,re
from pathlib import Path
E=c.CDLL('libEGL.so.1')
E.eglGetProcAddress.restype=c.c_void_p;E.eglGetProcAddress.argtypes=[c.c_char_p]
def egl(name,ret,args):
 f=getattr(E,name);f.restype=ret;f.argtypes=args;return f
getdisplay=c.CFUNCTYPE(c.c_void_p,c.c_uint,c.c_void_p,c.POINTER(c.c_int))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
display=getdisplay(0x31DD,None,None)
major,minor=c.c_int(),c.c_int()
assert egl('eglInitialize',c.c_uint,[c.c_void_p,c.POINTER(c.c_int),c.POINTER(c.c_int)])(display,c.byref(major),c.byref(minor))
assert egl('eglBindAPI',c.c_uint,[c.c_uint])(0x30A0)
attrib=(c.c_int*13)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3025,24,0x3038)
config=c.c_void_p();count=c.c_int()
assert egl('eglChooseConfig',c.c_uint,[c.c_void_p,c.POINTER(c.c_int),c.POINTER(c.c_void_p),c.c_int,c.POINTER(c.c_int)])(display,attrib,c.byref(config),1,c.byref(count)) and count.value
context=egl('eglCreateContext',c.c_void_p,[c.c_void_p,c.c_void_p,c.c_void_p,c.POINTER(c.c_int)])(display,config,None,(c.c_int*3)(0x3098,2,0x3038))
surface=egl('eglCreatePbufferSurface',c.c_void_p,[c.c_void_p,c.c_void_p,c.POINTER(c.c_int)])(display,config,(c.c_int*5)(0x3057,64,0x3056,64,0x3038))
assert egl('eglMakeCurrent',c.c_uint,[c.c_void_p,c.c_void_p,c.c_void_p,c.c_void_p])(display,surface,surface,context)
def gl(name,ret,args):return c.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
create=gl('glCreateShader',c.c_uint,[c.c_uint]);source=gl('glShaderSource',None,[c.c_uint,c.c_int,c.POINTER(c.c_char_p),c.POINTER(c.c_int)]);compile=gl('glCompileShader',None,[c.c_uint]);getiv=gl('glGetShaderiv',None,[c.c_uint,c.c_uint,c.POINTER(c.c_int)]);log=gl('glGetShaderInfoLog',None,[c.c_uint,c.c_int,c.POINTER(c.c_int),c.c_char_p])
js=(Path(__file__).resolve().parents[1] / 'dist/gpu-scene.js').read_text();shaders=[]
for name,kind in [('vertex',0x8B31),('fragment',0x8B30)]:
 code=re.search(r'const '+name+r' = `([\s\S]+?)`;',js)[1].encode();s=create(kind);buf=c.c_char_p(code);source(s,1,c.byref(buf),None);compile(s);ok=c.c_int();getiv(s,0x8B81,c.byref(ok));out=c.create_string_buffer(4096);log(s,4096,None,out);assert ok.value,out.value.decode();shaders.append(s);print(name+' shader compiled on Mesa GLES')
p=gl('glCreateProgram',c.c_uint,[])()
for s in shaders:gl('glAttachShader',None,[c.c_uint,c.c_uint])(p,s)
gl('glLinkProgram',None,[c.c_uint])(p);ok=c.c_int();gl('glGetProgramiv',None,[c.c_uint,c.c_uint,c.POINTER(c.c_int)])(p,0x8B82,c.byref(ok));assert ok.value
print('GPU program linked successfully. This validates GLSL, not the full browser UI.')
