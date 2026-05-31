<div align="center">
  <img src="public/logo-transparent.png" width="144" height="144" alt="Atlas" />
  <h1>Atlas</h1>

  <p><strong>Lightweight Terminal-first AI-native dev workspace.</strong></p>

  <p>
    <img src="https://img.shields.io/github/v/release/MDSD0/Atlas-ai?label=version&color=blue" alt="version" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS-lightgrey" alt="platform" />
  </p>
</div>

---

Atlas is a lightweight, natively compiled desktop application built with Tauri 2 + Rust and React 19. It brings powerful LLM capabilities directly to your local workspace, allowing you to ask questions, debug code, and analyze files with an ultra-lightweight footprint.

## Download

Latest installers are on the [Releases](https://github.com/MDSD0/Atlas-ai/releases/latest) page. 

## Features

- **Context-Aware AI**: Open any folder to "ground" the AI in your local workspace.
- **Multi-Model Support**: Seamlessly switch between the best LLMs right from the UI.
- **Blazing Fast**: Built on Rust and Tauri, uses less than 10MB of memory and starts instantly.
- **Aesthetic**: Custom UI with frosted glass effects and proper macOS integration.

## Build from source

**Prerequisites**
- Rust (stable), https://rustup.rs
- Node 20+ and npm
- Tauri prerequisites for your platform, https://tauri.app/start/prerequisites/

**Run**
```bash
npm install
npm run tauri dev          # development
npm run tauri build        # production bundle
```

## License

Atlas is licensed under the Apache-2.0 License.
