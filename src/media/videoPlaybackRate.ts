export interface PitchPreservingRatePlayer {
  playbackRate: number;
  preservesPitch: boolean;
}

export function applyPitchPreservingRate(player: PitchPreservingRatePlayer, rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Playback rate must be a positive finite number.');
  }

  player.preservesPitch = true;
  player.playbackRate = rate;
}
