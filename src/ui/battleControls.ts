import type { BattleRunner, PlaybackSpeed } from '@/render/battlePlayback';

export class BattleControls {
  private container: HTMLElement;
  private tickCounter: HTMLElement;
  private speedButtons: HTMLElement[];
  private runner: BattleRunner | null = null;

  constructor() {
    this.container = document.getElementById('battle-controls')!;
    this.tickCounter = document.getElementById('battle-tick-counter')!;
    this.speedButtons = [];

    // Bind speed buttons
    const speeds: PlaybackSpeed[] = [1, 2, 4];
    for (const speed of speeds) {
      const btn = document.getElementById(`speed-${speed}x`)!;
      btn.addEventListener('click', () => {
        this.setSpeed(speed);
      });
      this.speedButtons.push(btn);
    }

    // Skip button
    const skipBtn = document.getElementById('speed-skip')!;
    skipBtn.addEventListener('click', () => {
      this.runner?.skip();
    });
    this.speedButtons.push(skipBtn);

    // Default: 1x active
    this.setActiveButton('speed-1x');
  }

  bind(runner: BattleRunner): void {
    this.runner = runner;
    this.setSpeed(1);

    runner.onTickUpdate = (elapsed: number) => {
      this.tickCounter.textContent = `${elapsed.toFixed(1)}s`;
    };
  }

  show(): void {
    this.container.classList.add('visible');
  }

  hide(): void {
    this.container.classList.remove('visible');
    this.tickCounter.textContent = '';
  }

  private setSpeed(speed: PlaybackSpeed): void {
    this.runner?.setSpeed(speed);
    this.setActiveButton(`speed-${speed}x`);
  }

  private setActiveButton(activeId: string): void {
    for (const btn of this.speedButtons) {
      btn.classList.toggle('active', btn.id === activeId);
    }
  }
}
