const fs = require('fs');

function replaceFile(path, replacer) {
  if (fs.existsSync(path)) {
    let original = fs.readFileSync(path, 'utf8');
    let updated = replacer(original);
    if (original !== updated) {
      fs.writeFileSync(path, updated);
      console.log('Updated UI text in', path);
    }
  }
}

// 1. AiInputBar.tsx
replaceFile('src/modules/ai/components/AiInputBar.tsx', (c) => {
  return c.replace(/# snippets/g, '# skills')
          .replace(/SNIPPETS/g, 'SKILLS');
});

// 2. SkillsSection.tsx
replaceFile('src/settings/sections/SkillsSection.tsx', (c) => {
  return c.replace(/Personas and snippets the AI uses\./g, 'Personas and skills the AI uses.')
          .replace(/<Label>Snippets<\/Label>/g, '<Label>Skills</Label>')
          .replace(/>New snippet</g, '>New skill<')
          .replace(/"Edit snippet"/g, '"Edit skill"')
          .replace(/"New snippet"/g, '"New skill"')
          .replace(/No snippets yet\./g, 'No skills yet.')
          .replace(/as a <snippet> block/g, 'as a background context block');
});

// 3. SnippetPicker.tsx
replaceFile('src/modules/ai/components/SnippetPicker.tsx', (c) => {
  return c.replace(/Pre-built snippets/g, 'Built-in skills')
          .replace(/label="Snippets"/g, 'label="Custom skills"')
          .replace(/Add snippets in Settings → Agents\./g, 'Add skills in Settings → Skills.');
});

// 4. AiChat.tsx
replaceFile('src/modules/ai/components/AiChat.tsx', (c) => {
  return c.replace(/generate snippets/g, 'use skills');
});

