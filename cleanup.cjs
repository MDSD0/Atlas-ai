const fs = require('fs');

const files = [
  'src/components/ai-elements/chat-code.tsx',
  'src/components/ai-elements/tool.tsx',
  'src/modules/agents/components/NotificationBell.tsx',
  'src/modules/agents/lib/agentIcon.tsx',
  'src/modules/ai/components/AiStatusBarControls.tsx',
  'src/modules/ai/components/TodoStrip.tsx',
  'src/modules/sidebar/SidebarRail.tsx',
  'src/modules/statusbar/CwdBreadcrumb.tsx',
  'src/settings/components/ProviderIcon.tsx',
  'src/settings/components/ProviderKeyCard.tsx',
  'src/settings/sections/AboutSection.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Replace <HugeiconsIcon \n icon={var} \n size={12} \n ... />
  // We use a broader regex to catch multiline
  content = content.replace(/<HugeiconsIcon[\s\S]*?icon=\{([^}]+)\}[\s\S]*?\/>/g, (match, iconVar) => {
    // Extract size, strokeWidth, className if they exist
    const sizeMatch = match.match(/size=\{([^}]+)\}/);
    const strokeMatch = match.match(/strokeWidth=\{([^}]+)\}/);
    const classMatch = match.match(/className=(["'][^"']+["']|\{[^}]+\})/);

    const size = sizeMatch ? `size={${sizeMatch[1]}}` : '';
    let stroke = strokeMatch ? `strokeWidth={${strokeMatch[1]}}` : 'strokeWidth={1.5}';
    // override 1.75 or 2 to 1.5
    stroke = stroke.replace(/1\.75|2/g, '1.5');
    const className = classMatch ? `className=${classMatch[1]}` : '';

    return `{(() => { const I = ${iconVar}; return I ? <I ${size} ${stroke} ${className} /> : null; })()}`;
  });

  // Remove imports
  content = content.replace(/import\s+\{\s*HugeiconsIcon\s*\}\s*from\s+["']@hugeicons\/react["'];?\n?/g, '');
  content = content.replace(/import\s+\{[^}]+\}\s+from\s+["']@hugeicons\/core-free-icons["'];?\n?/g, '');

  fs.writeFileSync(file, content);
  console.log('Cleaned up', file);
});
