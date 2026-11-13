# Windows PowerShell 5.1 / SharePoint Server. Run as a site list administrator.
param(
    [Parameter(Mandatory=$true)][string]$SiteUrl,
    [Parameter(Mandatory=$true)][string]$UsersCsv
)
$ErrorActionPreference = 'Stop'
$SiteUrl = $SiteUrl.TrimEnd('/')
$headers = @{Accept='application/json;odata=verbose'}
$context = Invoke-RestMethod -Uri "$SiteUrl/_api/contextinfo" -Method Post -UseDefaultCredentials -Headers $headers
$headers['X-RequestDigest'] = $context.d.GetContextWebInformation.FormDigestValue
function Post-Json($url, $body) {
    $json = $body | ConvertTo-Json -Depth 30 -Compress
    Invoke-RestMethod -Uri $url -Method Post -UseDefaultCredentials -Headers $headers -ContentType 'application/json;odata=verbose;charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
}
# CSV is validated before making any list changes.
$users = @(Import-Csv -LiteralPath $UsersCsv -Encoding UTF8)
foreach ($row in $users) {
    $u = $row.payload | ConvertFrom-Json
    if (!$u.id -or $u.id -ne $row.id -or !$u.password.StartsWith('s1:')) { throw 'Invalid users CSV' }
}
foreach ($name in @('GS_Users','GS_Requests','GS_Audit')) {
    $url = "$SiteUrl/_api/web/lists/getbytitle('$name')"
    try { $list = Invoke-RestMethod -Uri $url -UseDefaultCredentials -Headers $headers }
    catch {
        if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
        $list = Post-Json "$SiteUrl/_api/web/lists" @{__metadata=@{type='SP.List'};Title=$name;BaseTemplate=100}
    }
    $fields = Invoke-RestMethod -Uri "$url/fields?`$filter=InternalName eq 'Payload'" -UseDefaultCredentials -Headers $headers
    if ($fields.d.results.Count -eq 0) {
        Post-Json "$url/fields/createfieldasxml" @{parameters=@{__metadata=@{type='SP.XmlSchemaFieldCreationInformation'};SchemaXml='<Field Type="Note" Name="Payload" StaticName="Payload" DisplayName="Payload" NumLines="8" RichText="FALSE" />';Options=0}} | Out-Null
    }
    # Unique Title prevents duplicate logical records if two clients create one concurrently.
    $headers['IF-MATCH']='*'; $headers['X-HTTP-Method']='MERGE'
    Post-Json "$url/fields/getbyinternalnameortitle('Title')" @{__metadata=@{type='SP.FieldText'};Indexed=$true;EnforceUniqueValues=$true} | Out-Null
    $headers.Remove('IF-MATCH'); $headers.Remove('X-HTTP-Method')
    if ($name -eq 'GS_Users') {
        $existing = Invoke-RestMethod -Uri "$url/items?`$top=1" -UseDefaultCredentials -Headers $headers
        if ($existing.d.results.Count -gt 0) { Write-Host 'GS_Users already contains records. User import skipped.'; continue }
        $info = Invoke-RestMethod -Uri "${url}?`$select=ListItemEntityTypeFullName" -UseDefaultCredentials -Headers $headers
        foreach ($row in $users) { Post-Json "$url/items" @{__metadata=@{type=$info.d.ListItemEntityTypeFullName};Title=$row.id;Payload=$row.payload} | Out-Null }
    }
    Write-Host "Ready: $name"
}
