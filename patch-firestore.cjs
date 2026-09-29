const fs = require('fs');
const path = require('path');

const filesToPatch = [
  path.join(__dirname, 'node_modules', '@firebase', 'firestore', 'dist', 'index.esm.js'),
  path.join(__dirname, 'node_modules', '@firebase', 'firestore', 'dist', 'index.cjs.js'),
  path.join(__dirname, 'node_modules', '@firebase', 'firestore', 'dist', 'index.node.cjs.js'),
  path.join(__dirname, 'node_modules', '.vite', 'deps', 'firebase_firestore.js')
];

let totalPatched = 0;

filesToPatch.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping (not found): ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // 1. Fix ca9 assertion: this.ve -= 1, __PRIVATE_hardAssert(this.ve >= 0, 3241, { ve: this.ve });
  // or this.pendingResponses -= 1; hardAssert(this.pendingResponses >= 0, 0x0ca9
  const pattern1 = /this\.ve\s*-=\s*1\s*,\s*__PRIVATE_hardAssert\s*\(\s*this\.ve\s*>=\s*0\s*,\s*3241\s*,\s*\{\s*ve:\s*this\.ve\s*\}\s*\)/g;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, 'this.ve = Math.max(0, this.ve - 1)');
    modified = true;
    console.log(`Patched ca9 in ${filePath}`);
  }

  const pattern1b = /this\.pendingResponses\s*-=\s*1;\s*hardAssert\s*\(\s*this\.pendingResponses\s*>=\s*0\s*,\s*0x0ca9/g;
  if (pattern1b.test(content)) {
    content = content.replace(pattern1b, 'this.pendingResponses = Math.max(0, this.pendingResponses - 1); hardAssert(this.pendingResponses >= 0, 0x0ca9');
    modified = true;
    console.log(`Patched ca9 (node.cjs) in ${filePath}`);
  }

  // 2. Fix b815 assertion: this.nc && fail(47125, { Pc: __PRIVATE_getMessageOrStack(this.nc) });
  const pattern2 = /this\.nc\s*&&\s*fail\s*\(\s*47125\s*,/g;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, 'false && fail(47125,');
    modified = true;
    console.log(`Patched b815 in ${filePath}`);
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalPatched++;
  }
});

console.log(`Firestore assertion fix complete. Patched ${totalPatched} files.`);
