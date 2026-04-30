# Session: Infrastructure — Pi 5 Setup, Pack Networking, Sunshine Optimization

## Summary
Continued from previous infra session. Installed VAAPI hardware encoding for Sunshine (h264/hevc_vaapi), significantly improving remote desktop quality. Set up Raspberry Pi 5 (CanaKit, 8GB) as "alpinespruce" — the third machine in the pack. Installed Node.js 22, Claude Code, and Tailscale on the Pi. Discussed agentic workflow strategy and model cost optimization.

## Changes
- Installed `intel-media-driver` + `libva-utils` on Omarchy — Sunshine now uses hardware VAAPI encoding
- Raspberry Pi 5 fully provisioned:
  - PiOS first-boot completed (user: alpinespruce)
  - Node.js 22.22.2 installed
  - Claude Code 2.1.119 installed
  - Tailscale installed (auth pending — needs browser approval)
  - `~/.workspace/` created with `automation/`, `experiments/`, `lab/`
  - `~/.workspace/CLAUDE.md` written — defines Pi as lab/automation runner
- SSH config on Omarchy: added `Host alpinespruce` (192.168.0.17)
- GitHub issues:
  - EdvardGK/spruceforge#26 updated with firewall fixes and VAAPI status
  - EdvardGK/spruceforge#27 created — introduces alpinespruce to the pack
- Installed `micro` text editor on Omarchy

## Technical Details
- Sunshine resolution capped at 1080p (laptop panel native). Edkjo's 27" monitor is 2560x1440, causing slight softness. Options: HDMI dummy plug for virtual 1440p, or accept the upscaling.
- Pi got new IP (192.168.0.16 -> 192.168.0.17) when switching from ethernet to WiFi. Static IP or Tailscale needed for stability.
- Firewall lesson: `iptables -A` appends after UFW's reject chain. Must use `iptables -I INPUT 1` or better yet `ufw allow from` for persistent rules.
- Agentic workflow cost analysis: Gemini Flash ($0.15/$0.60 per 1M) is ~100x cheaper than Opus ($15/$75) for agent routing. Local models (Ollama) viable on Omarchy (8-12GB budget) and Pi (3B models).

## Next
- Tailscale auth on Pi still pending (link provided, needs browser approval)
- Pi hostname rename: `sudo hostnamectl set-hostname alpinespruce`
- Static IP or Tailscale for reliable Pi access
- Firewall persistence: `sudo ufw allow from 10.42.0.0/24` on Omarchy
- Agentic workflow experiments on Pi (Gemini Flash API or local Ollama)

## Notes
- The "pack" is now 3 machines: omarchy (dev), edkjo (muscle), alpinespruce (lab)
- Cross-machine coordination works well via GitHub issues (spruceforge repo)
- Pi 5 with 8GB is plenty for Claude Code CLI and lightweight automation
- User interested in agentic workflows with cheap/local models — potential first experiment for the Pi
