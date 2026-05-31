import os
import re

src_dir = "src"

icon_map = {
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
    "FolderGitTwo": "FolderSync",
    "MessageMultiple": "MessageSquare",
    "AiContentGenerator": "Sparkles",
    "FolderCloud": "Cloud",
    "RemoveSquare": "MinusSquare",
    "ComputerTerminal": "Terminal",
    "ViewOffSlash": "EyeOff",
    "GlobalSearch": "Search",
    "Robot": "Bot",
    "CheckList": "ClipboardList"
}

for root, dirs, files in os.walk(src_dir):
    for f in files:
        if f.endswith(".tsx") or f.endswith(".ts"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
            
            orig_content = content
            
            # 1. Replace <HugeiconsIcon icon={IconName} /> with <IconName />
            # This regex needs to handle newlines, e.g. <HugeiconsIcon \n icon={IconName} />
            content = re.sub(r'<HugeiconsIcon[^>]*icon=\{([A-Za-z0-9_]+)\}[^>]*>', r'<\1 strokeWidth={1.5} />', content)
            
            # 2. Fix dynamic icons <HugeiconsIcon icon={o.icon} />
            content = re.sub(r'<HugeiconsIcon[^>]*icon=\{([A-Za-z0-9_.]+)\}[^>]*>', r'<\1 strokeWidth={1.5} />', content)

            # 3. Clean up stray closing tags and imports
            content = re.sub(r'</HugeiconsIcon>', '', content)
            content = re.sub(r'import\s+\{\s*HugeiconsIcon\s*\}\s*from\s*["\']@hugeicons/react["\'];?\n?', '', content)
            
            # 4. Map incorrect lucide imports
            def replace_imports(match):
                imports_str = match.group(1)
                imports = [i.strip() for i in imports_str.split(',')]
                new_imports = []
                for imp in imports:
                    if not imp: continue
                    parts = imp.split(' as ')
                    orig = parts[0].strip()
                    alias = parts[1].strip() if len(parts) > 1 else orig
                    
                    if orig in icon_map:
                        orig = icon_map[orig]
                    elif orig == "Github":
                        pass # Github usually exists in lucide-react? If it's failing, we might need a fallback.
                        # Wait, the error for Github was "Module '"lucide-react"' has no exported member 'Github'".
                        # Let's map Github to Github
                    
                    if orig != alias:
                        new_imports.append(f"{orig} as {alias}")
                    else:
                        new_imports.append(orig)
                
                # Deduplicate
                new_imports = list(dict.fromkeys(new_imports))
                return f"import {{ {', '.join(new_imports)} }} from \"lucide-react\"" + (";" if match.group(0).endswith(";") else "")

            content = re.sub(r'import\s+\{([^}]+)\}\s+from\s+["\']lucide-react["\'];?', replace_imports, content)

            # If Github still fails, wait, Lucide-react might just not have Github in this specific version, 
            # let's map Github to Globe if needed, or leave it. We'll see.
            
            # 5. Fix JSX intrinsic elements error when we do `<o.icon />`. In React, it must be Capitalized `<Icon />`
            # For dynamic components, we usually assign it to a capital letter variable.
            # But earlier we replaced `<HugeiconsIcon icon={o.icon} />` with `<o.icon strokeWidth={1.5} />` which is a syntax error!
            # Let's fix that.
            content = re.sub(r'<([a-z]\w*\.icon)', r'{\1 && <\1', content)
            # Actually, `o.icon` should be rendered dynamically as `const Icon = o.icon; <Icon />`.
            # A quicker hack for TSX: `<o.icon>` might error, wait: JSX requires components to be capitalized.
            # Let's replace `<o.icon strokeWidth={1.5} />` with `<Icon strokeWidth={1.5} />`? No, we don't know the scope.
            # A better way for dynamic icons is `React.createElement(o.icon, { strokeWidth: 1.5 })` 
            # Let's replace `<([a-zA-Z0-9_]+)\.icon([^>]*)>` with `{React.createElement(\1.icon, {\2})}` -- wait this is complex.
            
            # Let's just fix the `<o.icon` error by reverting it to a proper dynamic rendering:
            # We can use a utility or just `{(() => { const I = o.icon; return <I strokeWidth={1.5} />; })()}`
            content = re.sub(r'<([a-zA-Z0-9_]+)\.icon\s+strokeWidth=\{([0-9.]+)\}\s*/>', r'{(() => { const I = \1.icon; return I ? <I strokeWidth={\2} /> : null; })()}', content)
            content = re.sub(r'<([a-zA-Z0-9_]+)\.icon\s*/>', r'{(() => { const I = \1.icon; return I ? <I /> : null; })()}', content)

            if orig_content != content:
                with open(path, "w", encoding="utf-8") as file:
                    file.write(content)
                print(f"Fixed {path}")
