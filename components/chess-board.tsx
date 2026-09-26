import { Chess, Square } from 'chess.js';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

export type PersonalProfile = {
  corrections: Record<string, string>;
  boardPatterns: Record<string, number>;
};

export type ReconstructedMove = {
  id: number;
  original: string;
  corrected: string;
  beforeFen: string;
  afterFen: string;
  legal: boolean;
  confidence: number;
  notes: string;
};

const PROFILE_KEY = 'chess-scribe-profile-v2';
const defaultProfile: PersonalProfile = { corrections: {}, boardPatterns: {} };

export function loadProfile(): PersonalProfile {
  if (typeof window === 'undefined') return defaultProfile;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...defaultProfile, ...JSON.parse(raw) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

export function saveProfile(profile: PersonalProfile) {
  if (typeof window !== 'undefined') localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function normalizeToken(raw: string) {
  return raw.trim().replace(/[\u2013\u2014]/g, '-').replace(/[.,;:]+$/g, '').replace(/\s+/g, ' ');
}

function isMoveNumber(token: string) {
  return /^\d+\.(?:\.\.)?$/.test(token) || /^\d+\.\.\.$/.test(token);
}

function isResult(token: string) {
  return /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token);
}

// This recognizes notation-shaped text, but deliberately does not call it valid chess.
// Bare squares such as "a7" are retained for review, never auto-corrected.
function isNotationShaped(token: string) {
  return /^(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?(?:[1-8])?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8])$/i.test(token);
}

export function parseMoveCandidates(rawText: string) {
  const tokens = rawText
    .replace(/\r/g, '\n')
    .split(/\s+/)
    .map((token) => normalizeToken(token).replace(/^[([{]+|[)\]}]+$/g, ''))
    .filter(Boolean);

  const result: string[] = [];
  for (const token of tokens) {
    if (isMoveNumber(token) || isResult(token)) continue;
    if (isNotationShaped(token)) result.push(token);
  }
  return result.slice(0, 160);
}

function canonicalCandidates(token: string) {
  const value = normalizeToken(token);
  const lower = value.toLowerCase();
  const candidates = new Set<string>([value]);
  if (lower === '0-0') candidates.add('O-O');
  if (lower === '0-0-0') candidates.add('O-O-O');
  if (lower.endsWith('+')) candidates.add(lower.slice(0, -1));
  if (lower.endsWith('#')) candidates.add(lower.slice(0, -1));
  return [...candidates];
}

function exactLegalMove(chess: Chess, token: string) {
  const legalMoves = chess.moves();
  const wanted = canonicalCandidates(token).map((candidate) => candidate.toLowerCase());
  return legalMoves.find((move) => wanted.includes(move.toLowerCase())) ?? null;
}

export function legalSuggestions(chess: Chess, token: string) {
  const normalized = normalizeToken(token).toLowerCase();
  if (!normalized || normalized.length < 2) return [];
  return chess
    .moves()
    .filter((move) => move.toLowerCase().startsWith(normalized) || normalized.startsWith(move.toLowerCase().replace(/[+#]$/, '')))
    .slice(0, 10);
}

/**
 * Reconstruct conservatively. A noisy OCR token remains unresolved unless it is
 * exact SAN, an explicit user-learned correction, or a harmless castle alias.
 * We never choose a move by edit distance: that caused a7 -> c4 hallucinations.
 */
export function reconstructGame(rawText: string, profile: PersonalProfile) {
  const chess = new Chess();
  const candidates = parseMoveCandidates(rawText);
  const reconstructed: ReconstructedMove[] = [];

  for (const [id, original] of candidates.entries()) {
    const beforeFen = chess.fen();
    const learned = profile.corrections[normalizeToken(original).toLowerCase()];
    const exact = learned && chess.moves().includes(learned) ? learned : exactLegalMove(chess, original);

    if (!exact) {
      reconstructed.push({
        id,
        original,
        corrected: original,
        beforeFen,
        afterFen: beforeFen,
        legal: false,
        confidence: 0,
        notes: 'Low-confidence OCR: no automatic move was applied. Review this token manually.'
      });
      continue;
    }

    try {
      const move = chess.move(exact);
      reconstructed.push({
        id,
        original,
        corrected: move.san,
        beforeFen,
        afterFen: chess.fen(),
        legal: true,
        confidence: learned ? 0.99 : 1,
        notes: learned ? 'Applied a correction previously confirmed by you.' : 'Exact legal SAN match.'
      });
    } catch {
      reconstructed.push({
        id,
        original,
        corrected: original,
        beforeFen,
        afterFen: beforeFen,
        legal: false,
        confidence: 0,
        notes: 'The token could not be applied safely; no guess was made.'
      });
    }
  }

  return reconstructed;
}

export function exportPgn(game: ReconstructedMove[], eventName = 'Chess Scribe') {
  const headers = [
    `[Event "${eventName}"]`,
    '[Site "Local"]',
    `[Date "${new Date().toISOString().slice(0, 10)}"]`,
    '[Round "-"]',
    '[White "Player"]',
    '[Black "Opponent"]',
    '[Result "*"]'
  ];
  const moves = game.filter((entry) => entry.legal).map((entry, index) => index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ${entry.corrected}` : entry.corrected).join(' ');
  return `${headers.join('\n')}\n\n${moves}\n`;
}

export function exportFen(game: ReconstructedMove[]) {
  return game.length ? new Chess(game[game.length - 1].afterFen).fen() : new Chess().fen();
}

export function estimateEvaluation(boardFen: string) {
  const chess = new Chess(boardFen);
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let total = 0;
  for (const row of chess.board()) for (const cell of row) if (cell) total += values[cell.type] * (cell.color === 'w' ? 1 : -1);
  return total * (chess.turn() === 'w' ? 0.18 : -0.18);
}

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const pieceGlyphs: Record<string, string> = { wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔', bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚' };

export function ChessBoard({ fen, highlightedSquares = [], onSelectSquare }: { fen: string; highlightedSquares?: string[]; onSelectSquare?: (square: Square) => void }) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  return (
    <div className="mx-auto max-w-[440px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-lg">
      <div className="grid grid-cols-8">
        {chess.board().flatMap((row, rowIndex) => row.map((cell, colIndex) => {
          const square = `${files[colIndex]}${8 - rowIndex}` as Square;
          const dark = (rowIndex + colIndex) % 2 === 1;
          const glyph = cell ? pieceGlyphs[`${cell.color === 'w' ? 'w' : 'b'}${cell.type}`] : '';
          const pieceClass = cell?.color === 'w'
            ? 'text-white [text-shadow:0_1px_1px_#0f172a,0_0_2px_#0f172a]'
            : 'text-slate-950 [text-shadow:0_1px_0_#fff,0_0_2px_#fff]';
          return <button key={square} type="button" onClick={() => onSelectSquare?.(square)} className={`relative flex aspect-square items-center justify-center text-3xl transition hover:brightness-110 ${dark ? 'bg-slate-700' : 'bg-slate-100'} ${highlightedSquares.includes(square) ? 'ring-2 ring-brand-400 ring-inset' : ''}`}>
            {cell && <span className={`select-none ${pieceClass}`}>{glyph}</span>}
            {rowIndex === 7 && <span className="absolute bottom-1 right-1 text-[10px] font-medium opacity-60">{files[colIndex]}</span>}
            {colIndex === 0 && <span className="absolute left-1 top-1 text-[10px] font-medium opacity-60">{8 - rowIndex}</span>}
          </button>;
        }))}
      </div>
    </div>
  );
}

export function ScanPanel({ detectedText, onApplyCorrection, options, currentMove }: { detectedText: string; onApplyCorrection: (selectedMove: string) => void; options: string[]; currentMove: { original: string; corrected: string; notes: string } | null }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><div className="text-sm font-medium text-slate-200">Move review</div><div className="flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-brand-200"><Sparkles size={12} /> Learning</div></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">{currentMove ? <div className="space-y-3"><div><div className="text-xs uppercase tracking-[0.2em] text-slate-500">OCR token</div><div className="mt-1 text-base font-medium text-white">{currentMove.original}</div></div><div><div className="text-xs uppercase tracking-[0.2em] text-slate-500">Result</div><div className={`mt-1 text-base font-medium ${currentMove.legal ? 'text-emerald-300' : 'text-amber-300'}`}>{currentMove.legal ? currentMove.corrected : 'Needs review'}</div></div><div className="text-xs text-slate-400">{currentMove.notes}</div></div> : <div className="text-slate-400">No move selected.</div>}</div>
    <div className="mt-4 grid gap-2">{options.length ? options.map((option) => <button key={option} type="button" onClick={() => onApplyCorrection(option)} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-brand-500 hover:bg-slate-800"><span>{option}</span><ChevronRight size={16} className="text-brand-300" /></button>) : <div className="text-sm text-slate-400">No safe suggestions. Enter or confirm the move manually.</div>}</div>
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400"><span className="font-medium text-slate-200">Raw OCR output:</span><div className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">{detectedText || 'No OCR output yet.'}</div></div>
  </div>;
}
