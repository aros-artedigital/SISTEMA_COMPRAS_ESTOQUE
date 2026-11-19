# Cria o atalho "Gestor - Demonstração" na área de trabalho: abre o programa instalado usando o banco e o
# perfil de demonstração (%APPDATA%\gestor-estoque-compras\demonstracao). O sistema real não é tocado.
$pasta = Join-Path $env:APPDATA 'gestor-estoque-compras\demonstracao'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\Gestor de Estoque e Compras\Gestor de Estoque e Compras.exe'
New-Item -ItemType Directory -Force $pasta | Out-Null
$vbs = Join-Path $pasta 'abrir-demonstracao.vbs'
@"
' Abre o Gestor de Estoque e Compras no banco de DEMONSTRAÇÃO (dados fictícios).
Set sh = CreateObject("WScript.Shell")
sh.Environment("PROCESS")("ESTOQUE_DB_PATH") = "$pasta\estoque-demo.sqlite"
sh.Run """$exe"" ""--user-data-dir=$pasta\perfil""", 1, False
"@ | Set-Content -Path $vbs -Encoding Unicode
$desktop = [Environment]::GetFolderPath('Desktop')
$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Gestor - Demonstração.lnk'))
$atalho.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$atalho.Arguments = '"' + $vbs + '"'
$atalho.IconLocation = "$exe,0"
$atalho.Description = 'Gestor de Estoque e Compras - banco de demonstração (dados fictícios)'
$atalho.WorkingDirectory = $pasta
$atalho.Save()
Write-Output "Atalho criado em: $desktop"
