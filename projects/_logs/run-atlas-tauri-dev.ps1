$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME','User')
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
Set-Location 'C:\Users\name\Downloads\Atlas-ai'
pnpm tauri dev *> 'C:\Users\name\Downloads\Atlas-ai\projects\_logs\atlas-tauri-dev-ui-test.log'
