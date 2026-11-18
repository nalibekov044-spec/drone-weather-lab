import fs from 'node:fs';
export function fixCoffRelocations(elfPath, coffPath) {
  const elf = fs.readFileSync(elfPath), coff = fs.readFileSync(coffPath);
  const string = (buffer, at) => buffer.toString('utf8', at, buffer.indexOf(0, at));
  const sectionOffset = Number(elf.readBigUInt64LE(40)), sectionSize = elf.readUInt16LE(58), sectionCount = elf.readUInt16LE(60);
  const nameSection = sectionOffset + elf.readUInt16LE(62) * sectionSize;
  const names = Number(elf.readBigUInt64LE(nameSection + 24));
  const sections = Array.from({length:sectionCount},(_,i) => {
    const at = sectionOffset + i * sectionSize;
    return { name:string(elf,names+elf.readUInt32LE(at)), type:elf.readUInt32LE(at+4), offset:Number(elf.readBigUInt64LE(at+24)), size:Number(elf.readBigUInt64LE(at+32)), link:elf.readUInt32LE(at+40), target:elf.readUInt32LE(at+44) };
  });
  const symbolOffset = coff.readUInt32LE(8), symbolCount = coff.readUInt32LE(12), coffStrings = symbolOffset + symbolCount * 18;
  const coffName = at => coff.readUInt32LE(at) === 0 ? string(coff,coffStrings+coff.readUInt32LE(at+4)) : coff.toString('ascii',at,at+8).replace(/\0.*$/s,'');
  const coffSymbols = [];
  for (let i=0;i<symbolCount;) {
    const at=symbolOffset+i*18;
    coffSymbols.push({index:i,name:coffName(at),value:coff.readUInt32LE(at+8),section:coff.readInt16LE(at+12)});
    i += 1 + coff[at+17];
  }
  const coffSections = Array.from({length:coff.readUInt16LE(2)},(_,i)=>{
    const at=20+coff.readUInt16LE(16)+i*40;
    return {name:coff.toString('ascii',at,at+8).replace(/\0.*$/s,''),index:i+1,data:coff.readUInt32LE(at+20),relocations:coff.readUInt32LE(at+24),count:coff.readUInt16LE(at+32)};
  });
  let fixed = 0;
  for (const rela of sections.filter(s=>s.type===4)) {
    const target=coffSections.find(s=>s.name===sections[rela.target].name);
    if (!target) continue;
    const symtab=sections[rela.link], symnames=sections[symtab.link];
    const addresses=new Map();
    for(let i=0;i<target.count;i++) addresses.set(coff.readUInt32LE(target.relocations+i*10), target.relocations+i*10);
    for(let at=rela.offset;at<rela.offset+rela.size;at+=24){
      const address=Number(elf.readBigUInt64LE(at)),info=elf.readBigUInt64LE(at+8),type=Number(info&0xffffffffn),symbol=Number(info>>32n),addend=Number(elf.readBigInt64LE(at+16));
      if (type!==2 && type!==4) throw new Error(`Unsupported ELF relocation ${type}`);
      const st=symtab.offset+symbol*24,name=string(elf,symnames.offset+elf.readUInt32LE(st)),section=elf.readUInt16LE(st+6);
      const elfValue=Number(elf.readBigUInt64LE(st+8));
      let resolved=coffSymbols.find(s=>s.name===name && name);
      if ((elf[st+4]&15)===3) {
        const coffSection=coffSections.find(s=>s.name===sections[section].name);
        resolved=coffSymbols.find(s=>s.section===coffSection?.index && s.value===0);
      }
      if (!resolved) throw new Error(`Unmapped symbol ${name}`);
      const rel=addresses.get(address);
      if (rel===undefined) throw new Error('Missing COFF relocation');
      coff.writeUInt32LE(resolved.index,rel+4);coff.writeUInt16LE(4,rel+8);
      coff.writeInt32LE(addend+4+elfValue-resolved.value,target.data+address);
      fixed++;
    }
  }
  fs.writeFileSync(coffPath,coff);
  if (!fixed) throw new Error('No relocations checked');
}
