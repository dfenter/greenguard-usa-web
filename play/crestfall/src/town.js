// Town scene - top-down walking, NPCs, wise man, hospital
import { SCALE, NES_W, NES_H, SPELLS } from './constants.js';
import { drawTextPx, drawNPC, drawLink } from './sprites.js';
// Decision 3 (Rev 2): town NPC movement is a gameplay-affecting stream
// (NPC position gates dialogue interaction — town.js _checkInteract below),
// so it draws from townRng, not the cosmetic-only fxRng.
import { townRng } from './rng.js';

const S = SCALE;
const VIEW_Y = 57;

// Town layout is a simple top-down grid
// Each town has: road, houses (enter to get spells/healing), NPCs

const HOUSE_W = 24;
const HOUSE_H = 20;

function buildTownLayout(townData) {
  // Generic town with road down the middle, houses on sides
  const w = 256, h = 168;
  const centerY = h / 2;

  const houses = [];
  const roadY = centerY - 8;

  // Wise man's house (gives spell)
  houses.push({ x: 32, y: 20, w: HOUSE_W, h: HOUSE_H, type: 'wiseman', spell: townData.spell });
  // Hospital (if town has one)
  if (townData.hasHospital) {
    houses.push({ x: 80, y: 20, w: HOUSE_W, h: HOUSE_H, type: 'hospital' });
  }
  // Normal houses
  houses.push({ x: 140, y: 20, w: HOUSE_W, h: HOUSE_H, type: 'npc', npcIdx: 0 });
  houses.push({ x: 200, y: 20, w: HOUSE_W, h: HOUSE_H, type: 'npc', npcIdx: 1 });

  const npcs = [];
  const count = townData.npcCount || 3;
  for (let i = 0; i < count; i++) {
    npcs.push({
      idx: i,
      x: 40 + i * 45,
      y: roadY + 4,
      dir: i % 2 === 0 ? 1 : -1,
      text: townData.npcText?.[i] || 'HELLO TRAVELER.',
      walkTimer: townRng.next(`town.npc${i}.initialWalkTimer`) * 60,
      walkFrame: 0,
    });
  }

  return { w, h, houses, npcs, roadY };
}

export class TownScene {
  constructor(player) {
    this.player = player;
    this.townData = null;
    this.layout = null;

    // Player position in town
    this.px = 16;
    this.py = 80;
    this.pspeed = 1.5;
    this.pfacing = 1;

    this.talkTarget = null;
    this.dialogText = '';
    this.dialogTimer = 0;
    this.dialogPage = 0;
    this.dialogLines = [];

    this.done = false;
    this.healAnim = 0;
  }

  load(townData) {
    this.townData = townData;
    this.layout = buildTownLayout(townData);
    this.px = 16;
    this.py = this.layout.roadY + 4;
    this.pfacing = 1;
    this.done = false;
    this.dialogTimer = 0;
    this.talkTarget = null;
  }

  update(input) {
    if (this.dialogTimer > 0) {
      if (input.pressA || input.pressB) {
        this.dialogPage++;
        if (this.dialogPage >= this.dialogLines.length) {
          this.dialogTimer = 0;
          this.dialogLines = [];
          this.dialogPage = 0;
          // Process result if any
          if (this.talkTarget) {
            this._processInteract(this.talkTarget);
            this.talkTarget = null;
          }
        } else {
          this.dialogTimer = 300;
        }
      }
      return;
    }

    // Move player
    let dx = 0, dy = 0;
    if (input.left)  { dx = -1; this.pfacing = -1; }
    if (input.right) { dx =  1; this.pfacing =  1; }
    if (input.up)    dy = -1;
    if (input.down)  dy =  1;

    const nx = this.px + dx * this.pspeed;
    const ny = this.py + dy * this.pspeed;

    const layout = this.layout;

    // Clamp to town bounds
    const clampedX = Math.max(0, Math.min(layout.w - 8, nx));
    const clampedY = Math.max(layout.roadY, Math.min(layout.h - 16, ny));

    // House collision (can walk past, not into wall)
    let blocked = false;
    for (const h of layout.houses) {
      if (nx + 8 > h.x && nx < h.x + h.w && ny + 16 > h.y && ny < h.y + h.h) {
        blocked = true;
        break;
      }
    }

    if (!blocked) {
      this.px = clampedX;
      this.py = clampedY;
    }

    // Talk to NPC (A button)
    if (input.pressA) {
      this._checkInteract();
    }

    // Enter house (when standing at door)
    if (input.up) {
      for (const h of layout.houses) {
        const doorX = h.x + h.w / 2 - 4;
        const doorY = h.y + h.h;
        if (Math.abs(this.px - doorX) < 12 && Math.abs(this.py - doorY) < 10) {
          this._enterHouse(h);
          break;
        }
      }
    }

    // Start button exits town
    if (input.start) {
      this.done = true;
    }

    // Auto-exit at right edge
    if (this.px > layout.w - 8) {
      this.done = true;
    }

    // Update NPC walk
    for (const npc of layout.npcs) {
      npc.walkTimer++;
      if (npc.walkTimer >= 60 + townRng.next(`town.npc${npc.idx}.walkThreshold`) * 60) {
        npc.walkTimer = 0;
        npc.dir *= -1;
      }
      npc.x = Math.max(20, Math.min(layout.w - 20, npc.x + npc.dir * 0.4));
      if (npc.walkTimer % 16 < 8) npc.walkFrame = 1;
      else npc.walkFrame = 0;
    }

    if (this.healAnim > 0) this.healAnim--;
  }

  _checkInteract() {
    const layout = this.layout;
    // Check NPC proximity
    for (const npc of layout.npcs) {
      if (Math.abs(this.px - npc.x) < 20 && Math.abs(this.py - npc.y) < 16) {
        this._showDialog(npc.text, null);
        return;
      }
    }
  }

  _enterHouse(house) {
    if (house.type === 'wiseman') {
      const spellKey = house.spell;
      if (!spellKey) return;
      const spell = SPELLS[spellKey];
      if (!spell) return;
      if (this.player.spells[spellKey]) {
        this._showDialog(`YOU ALREADY KNOW ${spell.name}.`, null);
      } else {
        this.player.learnSpell(spellKey);
        this._showDialog(
          `${this.townData.wiseManText}\n\nYOU LEARNED THE ${spell.name} RUNE!`,
          null
        );
      }
    } else if (house.type === 'hospital') {
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;
      this.healAnim = 60;
      this._showDialog('YOUR VITALITY AND ARC ARE RESTORED!', null);
    } else if (house.type === 'npc') {
      const idx = house.npcIdx || 0;
      const text = this.townData.npcText?.[idx] || 'THERE IS NOTHING HERE.';
      this._showDialog(text, null);
    }
  }

  _processInteract(target) {
    // Post-dialog processing if needed
  }

  _showDialog(text, target) {
    // Split into pages of ~30 chars
    this.dialogLines = text.split('\n').reduce((acc, line) => {
      const words = line.split(' ');
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length > 32) {
          if (cur) acc.push(cur.trim());
          cur = w;
        } else {
          cur = (cur + ' ' + w).trim();
        }
      }
      if (cur) acc.push(cur.trim());
      return acc;
    }, []);

    this.dialogPage = 0;
    this.dialogTimer = 300;
    this.talkTarget = target;
  }

  draw(ctx) {
    const layout = this.layout;

    // Sky
    ctx.fillStyle = '#5858D8';
    ctx.fillRect(0, VIEW_Y * S, NES_W * S, NES_H * S);

    // Ground
    ctx.fillStyle = '#C8A870';
    ctx.fillRect(0, (VIEW_Y + layout.roadY) * S, NES_W * S, NES_H * S);

    // Road stripe down center
    ctx.fillStyle = '#B89860';
    ctx.fillRect(0, (VIEW_Y + layout.roadY + 6) * S, NES_W * S, 2 * S);

    // Houses
    for (const h of layout.houses) {
      this._drawHouse(ctx, h);
    }

    // NPCs
    for (const npc of layout.npcs) {
      const color = npc.type === 'wiseman' ? '#6844FC' : '#0058F8';
      drawNPC(ctx, Math.round(npc.x), VIEW_Y + Math.round(npc.y), color);
    }

    // Heal effect
    if (this.healAnim > 0) {
      const a = this.healAnim / 60;
      ctx.fillStyle = `rgba(0,200,0,${a * 0.3})`;
      ctx.fillRect(0, VIEW_Y * S, NES_W * S, NES_H * S);
    }

    // Player
    const state = 'stand';
    drawLink(ctx, Math.round(this.px), VIEW_Y + Math.round(this.py), 0, this.pfacing, state);

    // Town name
    drawTextPx(ctx, this.townData?.name || '', 4 * S, (VIEW_Y + 4) * S, '#F8D878', S);
    drawTextPx(ctx, 'STICK:MOVE  JUMP:TALK  MENU:EXIT', 4 * S, (VIEW_Y + 14) * S, '#888888', S);

    // Dialog box
    if (this.dialogTimer > 0 && this.dialogLines.length > 0) {
      const line = this.dialogLines[this.dialogPage];
      const lineW = Math.max(line.length * 6, 100);
      const dlgX = (NES_W - lineW) / 2;
      const dlgY = VIEW_Y + 80;
      ctx.fillStyle = '#000080';
      ctx.fillRect(dlgX * S, dlgY * S, lineW * S, 24 * S);
      ctx.strokeStyle = '#FCFCFC';
      ctx.lineWidth = S;
      ctx.strokeRect(dlgX * S, dlgY * S, lineW * S, 24 * S);
      drawTextPx(ctx, line, (dlgX + 4) * S, (dlgY + 8) * S, '#FCFCFC', S);
      if (this.dialogPage < this.dialogLines.length - 1) {
        drawTextPx(ctx, '>', (dlgX + lineW - 8) * S, (dlgY + 16) * S, '#F8D878', S);
      }
    }
  }

  _drawHouse(ctx, h) {
    const sy = VIEW_Y + h.y;
    // Wall
    ctx.fillStyle = '#F8F8C8';
    ctx.fillRect(h.x * S, sy * S, h.w * S, h.h * S);
    // Roof
    ctx.fillStyle = '#D81818';
    ctx.fillRect(h.x * S, sy * S, h.w * S, 6 * S);
    // Door
    ctx.fillStyle = '#884400';
    ctx.fillRect((h.x + h.w/2 - 3) * S, (sy + h.h - 8) * S, 6 * S, 8 * S);
    // Window
    ctx.fillStyle = '#00E8D8';
    ctx.fillRect((h.x + 4) * S, (sy + 8) * S, 6 * S, 6 * S);

    // Label
    let label = '';
    if (h.type === 'wiseman') {
      label = 'RUNE';
    } else if (h.type === 'hospital') {
      label = 'HEAL';
    }
    if (label) {
      drawTextPx(ctx, label, (h.x + 2) * S, (sy + 2) * S, '#FCFCFC', S);
    }
  }
}
