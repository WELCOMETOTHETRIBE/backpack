# Branding assets for the pilot VM

Place the background image you want to apply to the VM here.

Default expected file name (used by `Set-CuiLoginBannerAndWallpaper.ps1` when `-ImagePath` is not provided):

- `cui-system-background.png`

You can also pass a full path when running the script:

```powershell
powershell -ExecutionPolicy Bypass -File C:\hardening\Set-CuiLoginBannerAndWallpaper.ps1 -ImagePath "C:\hardening\assets\cui-system-background.png"
```

