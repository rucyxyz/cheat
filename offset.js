// CS2 offsets — 2026-11
// ゲームが更新されたらここだけ直す。他は触らなくてよい。
module.exports = {
  process: 'cs2.exe',
  modules: {
    client: 'client.dll',
    engine: 'engine2.dll'
  },

  // client.dll
  dwEntityList: 0x1A2A3B0,
  dwLocalPlayerPawn: 0x1A5B4A0,
  dwViewMatrix: 0x1A6B4D0,

  // C_BaseEntity / C_CSPlayerPawn
  m_iHealth: 0x34C,
  m_iTeamNum: 0x3E3,
  m_lifeState: 0x338,
  m_pGameSceneNode: 0x328,
  m_iIDEntIndex: 0x33B8,

  // CGameSceneNode / CModelState
  m_modelState: 0x170,
  m_vecAbsOrigin: 0x80,
  boneArray: 0x80,
  boneStride: 32,
  bonePos: 0x0C,

  // ボーン番号
  bones: {
    head: 6,
    neck: 5,
    pelvis: 1,
    footL: 76,
    footR: 79
  },

  // エンティティリストのストライド
  entStride: 0x78,
  entChunkShift: 9,
  entChunkSize: 0x10,

  // 仮想キーコード
  aimKey: 0x05,   // マウス4
  toggleKey: 0x2D // Insert
};
