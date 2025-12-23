# B2B 終檢表 (B2B SamartPlarm)

這是一個 B2B 終檢表的 React 專案，使用 Vite 構建，並配置了 Firebase Hosting 自動化部署。

## 快速開始

### 前置需求
- Node.js (建議 v18 以上)
- npm

### 安裝依賴
在專案根目錄執行：
```bash
npm install
```

### 啟動開發伺服器
```bash
npm run dev
```

### 建置專案
```bash
npm run build
```

## 部署 (Firebase Hosting)

本專案已設定 GitHub Actions 自動部署。

### 設定步驟
1. **初始化 Firebase** (如果尚未設定):
   請先安裝 Firebase CLI 並登入：
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   ```
   - 選擇你的 Firebase 專案。
   - Public directory 請輸入 `dist`。
   - Configure as a single-page app 選擇 **Yes**。
   - Set up automatic builds and deploys with GitHub 選擇 **Yes** (這會幫助你設定 Secrets，或者你可以手動設定)。

2. **手動設定 GitHub Secrets**:
   如果你沒有透過 CLI 設定 GitHub Action，你需要手動在 GitHub Repo 的 Settings > Secrets and variables > Actions 中新增：
   - `FIREBASE_SERVICE_ACCOUNT`: 貼上你的 Firebase Service Account JSON 內容。

3. **觸發部署**:
   當你推送到 `main` 分支時，GitHub Action 會自動建置並部署到 Firebase Hosting。

## 專案結構
- `src/`: 原始碼
- `public/`: 靜態資源
- `.github/workflows/`: CI/CD 設定檔
- `firebase.json`: Firebase Hosting 設定

## 技術堆疊
- React
- TypeScript
- Vite
- Firebase
- Lucide React (Icon)
