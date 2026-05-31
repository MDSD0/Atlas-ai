const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const iconMap = {
  "ArrowDown01Icon": "ChevronDown",
  "ArrowRight01Icon": "ChevronRight",
  "Cancel01Icon": "X",
  "MinusSignIcon": "Minus",
  "FolderOpenIcon": "FolderOpen",
  "Folder01Icon": "Folder",
  "UnfoldMoreIcon": "ChevronsUpDown",
  "ArrowUp01Icon": "ChevronUp",
  "AlertCircleIcon": "AlertCircle",
  "CheckmarkSquare02Icon": "CheckSquare",
  "CopyIcon": "Copy",
  "ArrowLeft01Icon": "ChevronLeft",
  "Download01Icon": "Download",
  "CheckmarkCircle01Icon": "CheckCircle",
  "CheckmarkCircle02Icon": "CheckCircle2",
  "GithubIcon": "Github",
  "Globe02Icon": "Globe",
  "Edit02Icon": "Edit",
  "Message01Icon": "MessageSquare",
  "MoreHorizontalCircle01Icon": "MoreHorizontal",
  "SearchIcon": "Search",
  "PlusSignIcon": "Plus",
  "Add01Icon": "Plus",
  "Refresh01Icon": "RefreshCw",
  "Search01Icon": "Search",
  "File01Icon": "FileText",
  "File02Icon": "FileText",
  "ServerStack03Icon": "Server",
  "IncognitoIcon": "EyeOff",
  "SquareIcon": "Square",
  "Settings01Icon": "Settings",
  "Alert02Icon": "AlertCircle",
  "Tick02Icon": "Check",
  "Loading03Icon": "Loader2",
  "CodeIcon": "Code",
  "TerminalIcon": "Terminal",
  "HashtagIcon": "Hash",
  "ArrowUpRight01Icon": "ArrowUpRight",
  "ArrowTurnBackwardIcon": "CornerUpLeft",
  "Delete02Icon": "Trash2"
};

const files = execSync("grep -rl hugeicons src").toString().split('\n').filter(Boolean);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace component usages: <HugeiconsIcon icon={IconName} ... /> -> <IconName ... />
  // Note: we need to handle multi-line as well, but simplest is regex
  // Let's replace <HugeiconsIcon icon={SomeIcon} => <SomeIcon
  content = content.replace(/<HugeiconsIcon\s+icon=\{([a-zA-Z0-9_]+)\}/g, '<$1');
  // Also clean up any remaining HugeiconsIcon tags (like closing tags if they existed, though usually self-closing)
  content = content.replace(/<\/HugeiconsIcon>/g, '');

  // Now, we need to find all Hugeicons imports and map them
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']@hugeicons\/core-free-icons["']/g;
  let match;
  let importedIcons = new Set();
  
  while ((match = importRegex.exec(content)) !== null) {
    const icons = match[1].split(',').map(i => i.trim()).filter(Boolean);
    icons.forEach(i => importedIcons.add(i));
  }

  // Remove hugeicons imports
  content = content.replace(/import\s+\{[^}]+\}\s+from\s+["']@hugeicons\/core-free-icons["'];?/g, '');
  content = content.replace(/import\s+\{[^}]+\}\s+from\s+["']@hugeicons\/react["'];?/g, '');

  if (importedIcons.size > 0) {
    // Collect mapped Lucide icons
    const lucideImports = [];
    importedIcons.forEach(iconName => {
      // Find aliases (e.g. if we map Edit02Icon to Edit, we import Edit)
      const mapped = iconMap[iconName] || iconName.replace(/0[1-9]Icon|Icon/g, ''); // fallback
      lucideImports.push(`${mapped} as ${iconName}`);
    });
    
    // Add lucide-react import at top
    const lucideImportStr = `import { ${lucideImports.join(', ')} } from "lucide-react";\n`;
    content = lucideImportStr + content;
  }
  
  // also fix some syntax from the <HugeiconsIcon removal, e.g. `<SomeIcon />` strokeWidth={1.75} -> 1.5
  content = content.replace(/strokeWidth=\{1\.75\}/g, 'strokeWidth={1.5}');
  content = content.replace(/strokeWidth=\{2\}/g, 'strokeWidth={1.5}');

  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
}
