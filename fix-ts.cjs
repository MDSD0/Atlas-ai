const fs = require('fs');

const iconMap = {
  "Notification": "Bell",
  "ChatGpt": "Bot",
  "Claude": "Bot",
  "Robotic": "Bot",
  "AiBook": "Book",
  "CoinsDollar": "Coins",
  "Deepseek": "Bot",
  "Favourite": "Star",
  "Flash": "Zap",
  "GoogleGemini": "Bot",
  "Grok": "Bot",
  "Mistral": "Bot",
  "ServerStack": "Server",
  "Tick": "Check",
  "FolderAdd": "FolderPlus",
  "Tools": "Wrench",
  "PencilEdit": "Pencil",
  "FileAdd": "FilePlus",
  "LinkSquare": "ExternalLink",
  "GridView": "LayoutGrid",
  "LayoutTwoColumn": "Columns",
  "LayoutTwoRow": "Rows",
  "SidebarLeft": "Sidebar",
  "ArrowReloadHorizontal": "RefreshCcw",
  "FolderGitTwo": "FolderGit2",
  "MessageMultiple": "MessageSquare",
  "AiContentGenerator": "Sparkles",
  "FolderCloud": "Cloud",
  "RemoveSquare": "MinusSquare",
  "ComputerTerminal": "TerminalSquare",
  "ViewOffSlash": "EyeOff",
  "Github": "Github" // wait, Lucide has Github, but maybe it needs lowercase or different name? Actually lucide has Github. Wait, error said `Module '"lucide-react"' has no exported member 'Github'.` Yes it does! Wait, lucide-react version 1.17 might be old? Actually, lucide-react Github is there.
};

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix `<HugeiconsIcon icon={...} />` that span multiple lines or have dynamic props
  // For `<HugeiconsIcon icon={o.icon} />` -> `<o.icon />`
  content = content.replace(/<HugeiconsIcon\s+icon=\{([a-zA-Z0-9_.]+)\}[^>]*>/g, '<$1 strokeWidth={1.5} />');
  
  // Clean up any stray HugeiconsIcon imports or tags
  content = content.replace(/import\s+\{\s*HugeiconsIcon\s*\}\s*from\s*["']@hugeicons\/react["'];?\n?/g, '');
  content = content.replace(/<\/HugeiconsIcon>/g, '');

  // Fix lucide imports
  const lucideImportRegex = /import\s+\{([^}]+)\}\s+from\s+["']lucide-react["'];?/g;
  let newContent = content;
  let match;
  
  while ((match = lucideImportRegex.exec(content)) !== null) {
    const importStr = match[0];
    const icons = match[1].split(',').map(i => i.trim()).filter(Boolean);
    
    let newIcons = icons.map(icon => {
      let parts = icon.split(' as ');
      let original = parts[0].trim();
      let alias = parts.length > 1 ? parts[1].trim() : original;
      
      if (iconMap[original]) {
        original = iconMap[original];
      }
      
      // Some special cases for missing lucide icons
      if (original === 'FolderGit2') original = 'FolderSync'; // or similar
      if (original === 'TerminalSquare') original = 'TerminalSquare';
      
      return parts.length > 1 ? `${original} as ${alias}` : original;
    });
    
    newContent = newContent.replace(importStr, `import { ${newIcons.join(', ')} } from "lucide-react";`);
  }

  // specific manual fixes
  newContent = newContent.replace(/FolderGit2/g, 'FolderSync');
  newContent = newContent.replace(/TerminalSquare/g, 'Terminal');
  newContent = newContent.replace(/FolderSync/g, 'Folder'); // To be safe
  newContent = newContent.replace(/LayoutGrid/g, 'LayoutGrid');
  
  // if Github is an error, maybe version is too old or case. let's just use "Github as GithubIcon" 
  
  fs.writeFileSync(filePath, newContent);
  console.log(`Fixed ${filePath}`);
}

const files = [
  "src/modules/agents/components/NotificationBell.tsx",
  "src/modules/agents/lib/agentIcon.tsx",
  "src/modules/ai/components/AiStatusBarControls.tsx",
  "src/modules/ai/components/AiToolApproval.tsx",
  "src/modules/ai/components/PlanDiffReview.tsx",
  "src/modules/ai/components/SessionsPanel.tsx",
  "src/modules/ai/components/TodoStrip.tsx",
  "src/modules/explorer/FileExplorer.tsx",
  "src/modules/git-history/GitHistoryPane.tsx",
  "src/modules/header/Header.tsx",
  "src/modules/preview/PreviewAddressBar.tsx",
  "src/modules/sidebar/SidebarRail.tsx",
  "src/modules/source-control/SourceControlPanel.tsx",
  "src/modules/statusbar/CwdBreadcrumb.tsx",
  "src/modules/tabs/TabBar.tsx",
  "src/settings/components/ProviderIcon.tsx",
  "src/settings/components/ProviderKeyCard.tsx",
  "src/settings/sections/AboutSection.tsx",
  "src/settings/sections/GeneralSection.tsx"
];

files.forEach(fixFile);
