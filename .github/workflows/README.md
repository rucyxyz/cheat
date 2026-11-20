## 起動

    npm install
    npm start

`index.html` の直接オープンでは動きません。必ず `npm start` から。

## ビルド

    npm run build

`dist/` に `cheat-1.0.0-win-x64-setup.exe`（インストーラ）と `cheat-1.0.0-win-x64-portable.exe`（インストール不要）が出ます。

初回起動時に SmartScreen の警告が出ます。「詳細情報」→「実行」で通ります。未署名のためです。

## リリース

    git tag v1.0.0
    git push origin v1.0.0

GitHub Actions がビルドして Releases に exe を添付します。

## 設定の保存先

    %APPDATA%\cheat\settings.json

消せば初期値に戻ります。

## モッド形式

    {
      "name": "example",
      "settings": {
        "aim.fov": 60,
        "esp.sil": false
      }
    }

`settings` を省いてフラットな JSON でも構いません。一致するキーだけが適用されます。

## ライセンス

MIT。全文は [LICENSE](LICENSE) を参照してください。
