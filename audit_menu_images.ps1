$menuPath = 'C:\Users\Lekhana\.antigravity-ide\cafeq-reservation-table\dist\menu.json'
$uploads = 'C:\Users\Lekhana\.antigravity-ide\cafeq-reservation-table\public\uploads\menu'
$menu = Get-Content -Raw $menuPath | ConvertFrom-Json
# Duplicate images
$dupImages = $menu | Group-Object -Property image | Where-Object { $_.Count -gt 1 } | Select-Object -ExpandProperty Name
# Compute file hashes
$hashMap = @{}
foreach ($item in $menu) {
    $img = $item.image
    $rel = $img -replace '^/uploads/menu/',''
    $full = Join-Path $uploads $rel
    $exists = Test-Path $full
    if ($exists) {
        $hash = Get-FileHash -Path $full -Algorithm SHA256 | Select-Object -ExpandProperty Hash
        if ($hashMap.ContainsKey($hash)) {
            $hashMap[$hash] += @($item.name)
        } else {
            $hashMap[$hash] = @($item.name)
        }
        $item | Add-Member -NotePropertyName __hash $hash -Force
    }
}
# Identify identical files (different names with same hash)
$identicalNames = @()
foreach ($hash in $hashMap.Keys) {
    if ($hashMap[$hash].Count -gt 1) {
        $identicalNames += $hashMap[$hash]
    }
}
# Output markdown table
"| Item | Category | Image | Issue |"
"|---|---|---|---|"
foreach ($item in $menu) {
    $issues = @()
    $rel = $item.image -replace '^/uploads/menu/',''
    $full = Join-Path $uploads $rel
    if (-not (Test-Path $full)) { $issues += 'Missing' }
    if ($dupImages -contains $item.image) { $issues += 'Duplicate' }
    if ($identicalNames -contains $item.name) { $issues += 'IdenticalFile' }
    $issueStr = ($issues -join ', ')
    "| $($item.name) | $($item.category) | $($item.image) | $issueStr |"
}