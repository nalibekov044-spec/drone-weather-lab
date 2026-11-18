import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import './embed-simulator.mjs';
import {fixCoffRelocations} from './fix-coff-relocations.mjs';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'artifacts');
const flags = ['-c','-O2','-std=c11','-ffreestanding','-fno-builtin','-fno-stack-protector','-fpie','-fno-asynchronous-unwind-tables','-mno-red-zone','-maccumulate-outgoing-args'];
const run = (name,args) => execFileSync(name,args,{stdio:'inherit'});
const imports = {
  KERNEL32:['GetTempPathW','CreateDirectoryW','CreateFileW','WriteFile','CloseHandle','GetCommandLineW','ExitProcess'],
  SHELL32:['ShellExecuteW'], USER32:['MessageBoxW']
};
const libraries = [];
for (const [name,symbols] of Object.entries(imports)) {
  const stem = path.join(out,name.toLowerCase());
  fs.writeFileSync(stem+'.c',symbols.map(symbol=>`void ${symbol}(void) {}`).join('\n'));
  fs.writeFileSync(stem+'.def',`LIBRARY ${name}.dll\nEXPORTS\n${symbols.join('\n')}\n`);
  run('gcc',[...flags,stem+'.c','-o',stem+'.elf']);
  run('objcopy',['-O','pe-x86-64','--remove-section=.comment',stem+'.elf',stem+'.obj']);
  run('ld',['-mi386pep','--dll','--out-implib='+stem+'.a','-o',stem+'.dll',stem+'.obj',stem+'.def']);
  libraries.push(stem+'.a');
}
run('gcc',[...flags,'-I',out,path.join(root,'desktop/Launcher.c'),'-o',path.join(out,'launcher.elf')]);
run('objcopy',['-O','pe-x86-64','--remove-section=.comment',path.join(out,'launcher.elf'),path.join(out,'launcher.obj')]);
fixCoffRelocations(path.join(out,'launcher.elf'),path.join(out,'launcher.obj'));
const exe = path.join(out,'Drone-Weather-Lab-0.92-Beta.exe');
run('ld',['-mi386pep','--entry','LauncherStart','--subsystem','windows','--major-os-version','6','--major-subsystem-version','6','--no-insert-timestamp','-o',exe,path.join(out,'launcher.obj'),...libraries]);
const bytes = fs.readFileSync(exe), pe = bytes.readUInt32LE(60);
if (bytes.toString('ascii',0,2) !== 'MZ' || bytes.readUInt32LE(pe) !== 0x4550 || bytes.readUInt16LE(pe+4) !== 0x8664 || bytes.readUInt16LE(pe+24) !== 0x20b) throw new Error('Invalid Windows x64 image');
const html = fs.readFileSync(path.join(root,'Drone-Weather-Lab-0.92-Beta.html'));
if (bytes.indexOf(html) < 0) throw new Error('Embedded HTML differs from the standalone build');
console.log(`Windows x64 executable built: ${bytes.length} bytes. PE headers and embedded HTML checked. Windows launch requires a Windows test.`);
