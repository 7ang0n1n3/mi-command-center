# MI Command - local PowerShell server with mi-data.json persistence
param([int]$Port = 8080)

$Root = [IO.Path]::GetFullPath($PSScriptRoot)
$RootWithSeparator = $Root.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$DataFile = Join-Path $Root "mi-data.json"

$DefaultJson = @'
{
  "version": 1,
  "meta": {
    "lastSaved": "",
    "revision": 0
  },
  "settings": {
    "orgName": "",
    "bridgeNumber": ""
  },
  "incidents": []
}
'@

function Get-DataJson {
    if (-not (Test-Path $DataFile)) {
        [IO.File]::WriteAllText($DataFile, $DefaultJson.Trim() + "`n", [Text.Encoding]::UTF8)
    }
    return [IO.File]::ReadAllText($DataFile, [Text.Encoding]::UTF8)
}

function Send-Response($Response, $StatusCode, $ContentType, $Body) {
    $Response.StatusCode = $StatusCode
    $Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $Response.Headers.Add("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
    $Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    if ($null -ne $Body) {
        $buffer = [Text.Encoding]::UTF8.GetBytes($Body)
        $Response.ContentType = $ContentType
        $Response.ContentLength64 = $buffer.Length
        $Response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    $Response.Close()
}

function Get-MimeType([string]$Path) {
    switch ([IO.Path]::GetExtension($Path).ToLower()) {
        ".html" { return "text/html; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".js"   { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".svg"  { return "image/svg+xml" }
        ".ico"  { return "image/x-icon" }
        default { return "application/octet-stream" }
    }
}

function Test-Object($Value) {
    return $null -ne $Value -and $Value -is [pscustomobject]
}

function Test-Array($Value) {
    return $null -ne $Value -and $Value -is [array]
}

function Test-Property($Object, [string]$Name) {
    return (Test-Object $Object) -and $Object.PSObject.Properties.Name -contains $Name
}

function Test-StringProperty($Object, [string]$Name, [bool]$Required = $true) {
    if (-not (Test-Property $Object $Name)) { return -not $Required }
    return $Object.$Name -is [string]
}

function Test-NumberProperty($Object, [string]$Name, [bool]$Required = $true) {
    if (-not (Test-Property $Object $Name)) { return -not $Required }
    return $Object.$Name -is [int] -or $Object.$Name -is [long] -or $Object.$Name -is [double] -or $Object.$Name -is [decimal]
}

function Test-BoolProperty($Object, [string]$Name, [bool]$Required = $true) {
    if (-not (Test-Property $Object $Name)) { return -not $Required }
    return $Object.$Name -is [bool]
}

function Test-TimestampProperty($Object, [string]$Name, [bool]$Required = $true, [bool]$AllowNull = $false) {
    if (-not (Test-Property $Object $Name)) { return -not $Required }
    if ($null -eq $Object.$Name) { return $AllowNull }
    if ($Object.$Name -is [datetime]) { return $true }
    if (-not ($Object.$Name -is [string])) { return $false }
    if ([string]::IsNullOrWhiteSpace($Object.$Name)) { return -not $Required }
    $parsed = [datetime]::MinValue
    return [datetime]::TryParse($Object.$Name, [ref]$parsed)
}

function Test-StringMap($Object, [string[]]$Keys) {
    if (-not (Test-Object $Object)) { return $false }
    foreach ($key in $Keys) {
        if (-not (Test-StringProperty $Object $key $true)) { return $false }
    }
    return $true
}

function Test-TimelineEntry($Entry) {
    if (-not (Test-Object $Entry)) { return $false }
    return (Test-StringProperty $Entry "id") -and
        (Test-TimestampProperty $Entry "timestamp") -and
        (Test-StringProperty $Entry "author") -and
        (Test-StringProperty $Entry "text") -and
        (Test-StringProperty $Entry "type")
}

function Test-ActionItem($Action) {
    if (-not (Test-Object $Action)) { return $false }
    return (Test-StringProperty $Action "id") -and
        (Test-StringProperty $Action "text") -and
        (Test-StringProperty $Action "owner") -and
        (Test-BoolProperty $Action "done") -and
        (Test-TimestampProperty $Action "updatedAt" $false) -and
        (Test-BoolProperty $Action "deleted" $false) -and
        (Test-TimestampProperty $Action "deletedAt" $false $true)
}

function Test-ObjectTimestampMap($Object, [bool]$Required = $false) {
    if ($null -eq $Object) { return -not $Required }
    if (-not (Test-Object $Object)) { return $false }
    foreach ($property in $Object.PSObject.Properties) {
        $holder = [pscustomobject]@{ value = $property.Value }
        if (-not (Test-TimestampProperty $holder "value" $false $true)) { return $false }
    }
    return $true
}

function Test-Incident($Incident) {
    if (-not (Test-Object $Incident)) { return $false }
    $validStatuses = @("declared", "investigating", "mitigating", "monitoring", "resolved")
    $validImpacts = @("enterprise", "department", "service")

    if (-not (Test-StringProperty $Incident "id")) { return $false }
    if (-not (Test-StringProperty $Incident "title")) { return $false }
    if (-not (Test-StringProperty $Incident "priority")) { return $false }
    if (-not (Test-StringProperty $Incident "severity")) { return $false }
    if (-not (Test-StringProperty $Incident "impact")) { return $false }
    if ($validImpacts -notcontains $Incident.impact) { return $false }
    if (-not (Test-StringProperty $Incident "services")) { return $false }
    if (-not (Test-StringProperty $Incident "description")) { return $false }
    if (-not (Test-StringProperty $Incident "status")) { return $false }
    if ($validStatuses -notcontains $Incident.status) { return $false }
    if (-not (Test-StringProperty $Incident "commander")) { return $false }
    if (-not (Test-TimestampProperty $Incident "createdAt")) { return $false }
    if (-not (Test-TimestampProperty $Incident "updatedAt")) { return $false }
    if (-not (Test-TimestampProperty $Incident "resolvedAt" $true $true)) { return $false }
    if (-not (Test-StringProperty $Incident "rootCause")) { return $false }
    if (-not (Test-StringProperty $Incident "resolution")) { return $false }
    if (-not (Test-Array $Incident.timeline)) { return $false }
    if (-not (Test-Array $Incident.actions)) { return $false }
    if (-not (Test-Array $Incident.comms)) { return $false }
    if (-not (Test-StringMap $Incident.team @("incidentCommander", "technicalLead", "commsLead", "scribe", "serviceOwner", "vendorContact"))) { return $false }
    if (-not (Test-ObjectTimestampMap $Incident.fieldUpdatedAt $false)) { return $false }
    if (-not (Test-ObjectTimestampMap $Incident.teamUpdatedAt $false)) { return $false }

    foreach ($entry in $Incident.timeline) {
        if (-not (Test-TimelineEntry $entry)) { return $false }
    }
    foreach ($action in $Incident.actions) {
        if (-not (Test-ActionItem $action)) { return $false }
    }

    return $true
}

function Test-MiData($Data) {
    if (-not (Test-Object $Data)) { return $false }
    if (-not (Test-NumberProperty $Data "version")) { return $false }
    if (-not (Test-Object $Data.meta)) { return $false }
    if (-not (Test-TimestampProperty $Data.meta "lastSaved")) { return $false }
    if (-not (Test-NumberProperty $Data.meta "revision")) { return $false }
    if (-not (Test-Object $Data.settings)) { return $false }
    if (-not (Test-StringProperty $Data.settings "orgName")) { return $false }
    if (-not (Test-StringProperty $Data.settings "bridgeNumber")) { return $false }
    if (-not (Test-Array $Data.incidents)) { return $false }

    foreach ($incident in $Data.incidents) {
        if (-not (Test-Incident $incident)) { return $false }
    }

    return $true
}

$listener = New-Object System.Net.HttpListener
$urls = @("http://localhost:$Port/")

try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -ExpandProperty IPAddress -Unique
    foreach ($ip in $ips) {
        $urls += "http://${ip}:$Port/"
    }
} catch {}

foreach ($url in $urls) {
    $listener.Prefixes.Add($url)
}

try {
    $listener.Start()
} catch {
    Write-Host "Could not bind network addresses. Trying localhost only..." -ForegroundColor Yellow
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
    $urls = @("http://localhost:$Port/")
}

Write-Host ""
Write-Host "MI Command - open in browser (share with your team):"
foreach ($url in $urls) {
    Write-Host "  $($url.TrimEnd('/'))"
}
Write-Host ""
Write-Host "Data file: $DataFile"
Write-Host "Press Ctrl+C to stop"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $path = $request.Url.LocalPath

        try {
            if ($request.HttpMethod -eq "OPTIONS") {
                Send-Response $response 204 $null $null
                continue
            }

            if ($path -eq "/api/status") {
                Send-Response $response 200 "application/json" '{"mode":"file","path":"mi-data.json","writable":true}'
                continue
            }

            if ($path -eq "/api/data" -and $request.HttpMethod -eq "GET") {
                Send-Response $response 200 "application/json" (Get-DataJson)
                continue
            }

            if ($path -eq "/api/data" -and $request.HttpMethod -eq "PUT") {
                $reader = New-Object IO.StreamReader($request.InputStream, $request.ContentEncoding)
                $body = $reader.ReadToEnd()
                $reader.Close()
                $parsed = $body | ConvertFrom-Json -ErrorAction Stop
                if (-not (Test-MiData $parsed)) {
                    Send-Response $response 400 "text/plain" "Invalid MI data schema"
                    continue
                }
                [IO.File]::WriteAllText($DataFile, $body.TrimEnd() + "`n", [Text.Encoding]::UTF8)
                Send-Response $response 200 $null $null
                continue
            }

            $relative = $path.TrimStart("/")
            if ([string]::IsNullOrEmpty($relative)) { $relative = "index.html" }
            $relative = $relative -replace "/", [IO.Path]::DirectorySeparatorChar
            $fullPath = [IO.Path]::GetFullPath((Join-Path $Root $relative))

            $isRootFile = [string]::Equals($fullPath, $Root, [StringComparison]::OrdinalIgnoreCase)
            $isInsideRoot = $fullPath.StartsWith($RootWithSeparator, [StringComparison]::OrdinalIgnoreCase)

            if (-not ($isRootFile -or $isInsideRoot)) {
                Send-Response $response 403 $null $null
                continue
            }

            if (Test-Path $fullPath -PathType Leaf) {
                $bytes = [IO.File]::ReadAllBytes($fullPath)
                $response.StatusCode = 200
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.ContentType = Get-MimeType $fullPath
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
            } else {
                Send-Response $response 404 $null $null
            }
        }
        catch {
            $errorMessage = $_.Exception.Message
            Send-Response -Response $response -StatusCode 500 -ContentType "text/plain" -Body $errorMessage
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
