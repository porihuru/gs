window.GS_CONFIG = {
 mode: 'csv', // 'sharepoint' に変更するとSharePointリストへ接続
 siteUrl: '', // 例: https://intranet/sites/outing （同一オリジン）
 lists: {users:'GS_Users',requests:'GS_Requests',audit:'GS_Audit'},
 mailMode: 'simulate' // 本番の送信設定を確認後に 'sharepoint' へ変更
};
