'use client';

import { Chess } from 'chess.js';
import Tesseract from 'tesseract.js';
import { BrainCircuit, Download, FileImage, Gamepad2, Shield, UploadCloud, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChessBoard,
  ScanPanel,
  estimateEvaluation,
  exportFen,
  exportPgn,
  loadProfile,
  reconstructGame,
  saveProfile,
  type PersonalProfile,
  type ReconstructedMove
} from '@/components/chess-board';

export default function Page() {
  const [profile, setProfile] = useState<PersonalProfile>(() => loadProfile());
  const [detectedText, setDetectedText] = useState('');
  const [moves, setMoves] = useState<ReconstructedMove[]>([]);
  const [selectedMoveIndex, setSelectedMoveIndex] = useState(0);
  const [status, setStatus] = useState('Ready for a scoresheet image.');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const selectedMove = moves[selectedMoveIndex] ?? null;
  const boardFen = selectedMove?.beforeFen || new Chess().fen();

  const legalOptions = useMemo(() => {
    if (!selectedMove) return [];
    const chess = new Chess(selectedMove.beforeFen);
    return chess.moves().slice(0, 10);
  }, [selectedMove]);

  const applyTranscription = (text: string) => {
    const reconstruction = reconstructGame(text, profile);
    setMoves(reconstruction);
    setSelectedMoveIndex(0);
    setStatus(
      reconstruction.length
        ? `Reconstructed ${reconstruction.length} moves from the scoresheet.`
        : 'No legal moves were reconstructed from the uploaded text.'
    );
  };

  const handleDemoUpload = () => {
    const sample =
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 d5 5. exd5 Nxd5 6. Nxe5 Nxe5 7. Re1 Qd6 8. Bb5+ c6 9. Ba4 Nf4 10. Ne2 Nxe2+ 11. Rxe2 Qg6 12. O-O O-O 13. Re1 Nd4 14. c3 Nf3+ 15. gxf3 Bf5 16. f4 Rae8 17. Rxe8 Rxe8 18. Qd2 Qh5 19. Qf2 b5 20. Bb3';
    setDetectedText(sample);
    applyTranscription(sample);
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatus(`Scanning ${file.name}...`);

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            setStatus(`Recognizing scoresheet text... ${Math.round(message.progress * 100)}%`);
          }
        }
      });

      const text = result.data.text || '';
      setDetectedText(text);
      applyTranscription(text);
    } catch (error) {
      console.error(error);
      setStatus('Scan failed. Try the demo transcript or upload a cleaner image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onApplyCorrection = (selectedMoveValue: string) => {
    if (!selectedMove) return;

    const current = moves[selectedMoveIndex];
    if (!current) return;

    const nextProfile: PersonalProfile = {
      ...profile,
      corrections: {
        ...profile.corrections,
        [current.original.toLowerCase()]: selectedMoveValue
      }
    };

    setProfile(nextProfile);
    setStatus(`Saved correction: ${current.original} → ${selectedMoveValue}`);

    const updatedMoves = [...moves];
    updatedMoves[selectedMoveIndex] = {
      ...current,
      corrected: selectedMoveValue,
      legal: true,
      confidence: 0.98,
      notes: 'Corrected by user and saved to the personal recognition profile.'
    };

    setMoves(updatedMoves);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/20 text-brand-300 ring-1 ring-brand-500/40">
              <BrainCircuit size={18} />
            </div>
            <div>
              <div className="text-xl font-black tracking-tight">Chess Scribe</div>
              <div className="text-sm text-slate-400">Score sheet recognition that learns you</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-500"
            >
              <UploadCloud size={16} />
              {isProcessing ? 'Processing...' : 'Upload scoresheet'}
            </button>
            <button
              type="button"
              onClick={handleDemoUpload}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
            >
              <Gamepad2 size={16} />
              Demo transcript
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
            />
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <FileImage size={16} className="text-brand-300" /> Scoresheet review
              </div>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                {profile.corrections && Object.keys(profile.corrections).length > 3 ? 'Profile active' : 'New user'}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">Board preview</div>
                <ChessBoard fen={boardFen} highlightedSquares={[]} />
              </div>

              <ScanPanel
                detectedText={detectedText}
                currentMove={
                  selectedMove
                    ? {
                        original: selectedMove.original,
                        corrected: selectedMove.corrected,
                        notes: selectedMove.notes
                      }
                    : null
                }
                options={legalOptions}
                onApplyCorrection={onApplyCorrection}
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <BrainCircuit size={16} className="text-brand-300" /> Learning
                </div>
                <div className="mt-3 text-2xl font-bold">{Object.keys(profile.corrections).length}</div>
                <div className="text-xs text-slate-500">Stored handwriting corrections</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Zap size={16} className="text-amber-300" /> Engine
                </div>
                <div className="mt-3 text-2xl font-bold">{estimateEvaluation(boardFen).toFixed(2)}</div>
                <div className="text-xs text-slate-500">Material-based eval estimate</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Download size={16} className="text-emerald-300" /> Export
                </div>
                <div className="mt-3 text-lg font-bold">PGN / FEN</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(exportPgn(moves))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:border-emerald-600 hover:bg-slate-800"
                  >
                    PGN
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(exportFen(moves))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:border-emerald-600 hover:bg-slate-800"
                  >
                    FEN
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-300">
                <Shield size={16} className="text-emerald-300" /> Status
              </div>
              <p className="text-sm leading-relaxed text-slate-300">{status}</p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-4 text-sm font-medium text-slate-300">Move list</div>
              <div className="max-h-[420px] space-y-2 overflow-auto">
                {moves.length ? (
                  moves.map((move, index) => (
                    <button
                      key={`${move.original}-${index}`}
                      type="button"
                      onClick={() => setSelectedMoveIndex(index)}
                      className={[
                        'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition',
                        index === selectedMoveIndex
                          ? 'border-brand-500 bg-brand-500/10 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600'
                      ].join(' ')}
                    >
                      <span className="font-mono">
                        {Math.floor(index / 2) + 1}{index % 2 === 0 ? '.' : '...'} {move.original || move.corrected}
                      </span>
                      <span className={move.legal ? 'text-emerald-300' : 'text-amber-300'}>{move.legal ? '✓' : '!'}</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                    No moves yet. Upload a scoresheet or run the demo.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
