const fs = require('fs');
const glob = require('child_process').execSync('find src -type f -name "*.tsx"').toString().split('\n').filter(Boolean);

glob.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let orig = content;
  
  // Fix return ( {(() => { ... })()} ); -> just run the code
  content = content.replace(/return\s*\(\s*\{\(\(\)\s*=>\s*\{([\s\S]*?)\}\)\(\)\}\s*\);?/g, (match, innerCode) => {
    return innerCode; 
  });
  
  // Fix other places where `{(() => ... )()}` is floating without being inside a JSX element.
  // For example:
  // const MyComponent = () => (
  //   {(() => ... )()}
  // )
  // We can just wrap the `{(() => ... )()}` in `<>{...}</>`.
  content = content.replace(/=>\s*\(\s*(\{\(\(\)\s*=>\s*\{[\s\S]*?\}\)\(\)\})\s*\)/g, '=> (<>$1</>)');
  
  // What about `content = {(() => ... )()}`? That's actually valid JS.
  // The error `JSX expressions must have one parent element.` might come from returning an object literal `{ ... }` when JSX was expected, but wait!
  // `error TS2657: JSX expressions must have one parent element.` happens when there's `<> ... </> <HugeiconsIcon />` ?
  // Actually, `{...}` without parent tags is just a block or object.
  // A safer fix: wrap all `{(() => { const I = ...; return I ? ... : null; })()}` with `<> ... </>` IF they are not inside another tag.
  // Instead of complex AST, I will just manually fix the 15 files with errors. Wait, there were only 6 or 7 files with syntax errors.
  
  if (orig !== content) {
    fs.writeFileSync(file, content);
    console.log('Fixed syntax in', file);
  }
});
