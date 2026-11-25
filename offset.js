// Valorant (UE4) 構造オフセット
// パッチで動いたら数値だけ差し替える。UWorld は 0 にしておけば自動スキャン。
module.exports = {
  process: 'VALORANT-Win64-Shipping.exe',
  modules: {
    client: 'VALORANT-Win64-Shipping.exe'
  },

  // 0 = 自動スキャン（推奨）
  dwUWorld: 0,

  // UWorld
  persistentLevel: 0x30,
  owningGameInstance: 0x1B8,

  // ULevel
  actors: 0xA0,

  // TArray
  arrayCount: 0x8,

  // UGameInstance
  localPlayers: 0x38,

  // ULocalPlayer
  localPlayerController: 0x30,

  // APlayerController
  acknowledgedPawn: 0x4C0,
  playerCameraManager: 0x4A8,
  controlRotation: 0x3B0,

  // APlayerCameraManager -> FCameraCacheEntry
  cameraCache: 0x1A0,
  povLocation: 0x10,
  povRotation: 0x1C,
  povFov: 0x28,

  // AActor / USceneComponent
  rootComponent: 0x1C8,
  relativeLocation: 0x1D8,

  // APawn
  playerState: 0x2A8,
  health: 0x1A0,

  // APlayerState
  teamNum: 0x4B0,

  // 身体の高さ（ルートからの相対）
  headOffset: 68,
  footOffset: 3,
  maxDistance: 25000,

  // 仮想キーコード
  aimKey: 0x05,   // マウス4
  toggleKey: 0x2D // Insert
};
