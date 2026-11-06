import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { musicPlayer } from '@/audio/music'
import { sfx } from '@/audio/sfx'
import type { OpeningMode } from '@/core/types'

const KEY = 'gomoku.settings.v1'

interface Persisted {
  mode: OpeningMode
  forbidden: boolean
  blackName: string
  whiteName: string
  musicTrack: string | null
  musicVolume: number
  musicMuted: boolean
  sfxEnabled: boolean
  autoRotate: boolean
  showHints: boolean
  showForbidden: boolean
  firstChoice: 'black' | 'white' | 'random'
  lanUrl: string
  woodTone: 'classic' | 'walnut' | 'dark'
}

function load(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted>
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = load()

  const mode = ref<OpeningMode>(saved.mode ?? 'tara-10')
  const forbidden = ref<boolean>(saved.forbidden ?? true)
  const blackName = ref(saved.blackName ?? '黑方')
  const whiteName = ref(saved.whiteName ?? '白方')
  const musicTrack = ref<string | null>(saved.musicTrack ?? null)
  const musicVolume = ref(saved.musicVolume ?? 0.45)
  const musicMuted = ref(saved.musicMuted ?? false)
  const sfxEnabled = ref(saved.sfxEnabled ?? true)
  const autoRotate = ref(saved.autoRotate ?? false)
  const showHints = ref(saved.showHints ?? true)
  const showForbidden = ref(saved.showForbidden ?? true)
  const firstChoice = ref<'black' | 'white' | 'random'>(saved.firstChoice ?? 'random')
  const lanUrl = ref(saved.lanUrl ?? '')
  const woodTone = ref<'classic' | 'walnut' | 'dark'>(saved.woodTone ?? 'classic')

  function persist(): void {
    const data: Persisted = {
      mode: mode.value,
      forbidden: forbidden.value,
      blackName: blackName.value,
      whiteName: whiteName.value,
      musicTrack: musicTrack.value,
      musicVolume: musicVolume.value,
      musicMuted: musicMuted.value,
      sfxEnabled: sfxEnabled.value,
      autoRotate: autoRotate.value,
      showHints: showHints.value,
      showForbidden: showForbidden.value,
      firstChoice: firstChoice.value,
      lanUrl: lanUrl.value,
      woodTone: woodTone.value
    }
    localStorage.setItem(KEY, JSON.stringify(data))
  }

  watch(
    [mode, forbidden, blackName, whiteName, musicTrack, musicVolume, musicMuted, sfxEnabled, autoRotate, showHints, showForbidden, firstChoice, lanUrl, woodTone],
    persist
  )

  // 音乐联动
  watch(musicTrack, async (id) => {
    if (id) await musicPlayer.play(id)
    else musicPlayer.stop()
    musicPlayer.setMuted(musicMuted.value)
  })
  watch(musicVolume, (v) => musicPlayer.setVolume(v))
  watch(musicMuted, (m) => musicPlayer.setMuted(m))
  watch(sfxEnabled, (v) => sfx.setEnabled(v))

  function applyMusic(): void {
    if (musicTrack.value) void musicPlayer.play(musicTrack.value)
    musicPlayer.setVolume(musicVolume.value)
    musicPlayer.setMuted(musicMuted.value)
    sfx.setEnabled(sfxEnabled.value)
  }

  return {
    mode,
    forbidden,
    blackName,
    whiteName,
    musicTrack,
    musicVolume,
    musicMuted,
    sfxEnabled,
    autoRotate,
    showHints,
    showForbidden,
    firstChoice,
    lanUrl,
    woodTone,
    applyMusic,
    persist
  }
})
