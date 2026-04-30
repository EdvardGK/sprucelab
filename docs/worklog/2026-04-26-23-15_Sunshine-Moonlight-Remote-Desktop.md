# Session: Sunshine/Moonlight Remote Desktop Setup (Omarchy <-> Edkjo)

## Summary
Set up Sunshine (host) on Omarchy and Moonlight (client) on edkjo for remote desktop control of the Linux laptop from the Windows PC. Both machines are on the same desk. Coordinated cross-machine setup via GitHub issues (EdvardGK/spruceforge#26). Connection is working with hardware-accelerated VAAPI encoding, though resolution is capped at 1080p (laptop panel native).

## Changes
- Installed `sunshine` (AUR) on Omarchy as remote desktop host
- Installed `intel-media-driver` + `libva-utils` for VAAPI hardware encoding (h264_vaapi, hevc_vaapi)
- Enabled Sunshine as user service: `systemctl --user enable --now sunshine`
- Added iptables rule: `iptables -I INPUT 1 -s 10.42.0.0/24 -j ACCEPT` (ethernet subnet, not persistent)
- Added iptables rule: `iptables -I INPUT 1 -s 192.168.0.0/24 -j ACCEPT` (WiFi subnet, used as fallback)
- Created GitHub issue EdvardGK/spruceforge#26 for cross-machine coordination
- Installed `micro` text editor

## Technical Details
- Sunshine captures eDP-1 (1920x1080) via Wayland screencopy protocol
- Initially used software encoding (libx264), switched to VAAPI after installing intel-media-driver
- Firewall was the main blocker: UFW with DROP policy meant appended iptables rules never fired. Had to INSERT at position 1
- Ethernet link (10.42.0.x) went down during session; fell back to WiFi (192.168.0.x)
- Edkjo's monitor is 2560x1440 — 1080p stream looks slightly soft due to upscaling. Options: accept it, run windowed, or use HDMI dummy plug for virtual 1440p display
- Hyprland hotkeys (Super+key) don't pass through Moonlight cleanly — Windows intercepts them
- iptables rules are NOT persistent (won't survive reboot). Should use `sudo ufw allow from 10.42.0.0/24` for persistence

## Next
- Make firewall rules persistent via UFW instead of raw iptables
- Fix ethernet link between Omarchy and edkjo (cable or NIC issue on edkjo side)
- Investigate Hyprland hotkey passthrough in Moonlight
- Consider HDMI dummy plug for 1440p streaming
- Raspberry Pi 5 (CanaKit, 8GB) connected to router at 192.168.0.16 — needs first-boot setup (monitor+keyboard or headless SD card config) before SSH is available
- Sprucelab dev work paused this session — resume from previous next-steps

## Notes
- Parsec does NOT support Linux hosting (client only)
- Tailscale is already on both machines and bypasses firewall (ts-input chain) — could use Tailscale IPs as alternative to ethernet/WiFi
- Pi MAC 2c:cf:67:e9:e4:79 confirms it's a Raspberry Pi on 192.168.0.16
