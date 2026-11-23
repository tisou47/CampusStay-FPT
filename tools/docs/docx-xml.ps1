# Shared helpers: read a .docx's main XML without Word. Dot-source it: . "$PSScriptRoot\docx-xml.ps1"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$script:W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function Read-DocxXml([string]$Path) {
    $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
    try {
        $reader = New-Object System.IO.StreamReader($zip.GetEntry('word/document.xml').Open(), [System.Text.Encoding]::UTF8)
        [xml]$doc = $reader.ReadToEnd()
        $reader.Close()
    } finally { $zip.Dispose() }
    $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
    $ns.AddNamespace('w', $script:W)
    return @{ Doc = $doc; Ns = $ns }
}

# Paragraphs of the body as { Style; Text }.
function Get-DocxParagraphs($x) {
    foreach ($p in $x.Doc.SelectNodes('//w:body//w:p', $x.Ns)) {
        $style = $p.SelectSingleNode('w:pPr/w:pStyle', $x.Ns)
        [pscustomobject]@{
            Style = if ($style) { $style.GetAttribute('val', $script:W) } else { '' }
            Text  = (($p.SelectNodes('.//w:t', $x.Ns) | ForEach-Object { $_.InnerText }) -join '').Trim()
        }
    }
}

# Template text that must not survive in a filled document.
$script:Placeholders = '<<|<Feature|<Function|<Sequence|<Project|<Group name>|<dd/mm|<Developer Name>|System name\d|Workflow \d|Feature Name \d|Function Name \d'
