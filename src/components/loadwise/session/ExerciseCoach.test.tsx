// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseCoach } from './ExerciseCoach';
import type { TrainingExercise } from '@/lib/loadwise/types';

const mocks = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/lib/loadwise/auth', () => ({ useAuth: () => ({ user: { id: 'athlete' } }) }));
vi.mock('@/lib/loadwise/store', () => ({ useLoadwise: () => ({ state: { profile: { age: 14 } } }) }));
vi.mock('@/lib/trainingCoach/transport', () => ({ askTrainingCoach: mocks.ask }));
const exercise: TrainingExercise = { id: 'set-1', exerciseId: 'goblet_squat', name: 'Przysiad', sets: '2', reps: '6', tempo: '3-0-X-0', restAfterExercise: '90 s' };
let host: HTMLDivElement; let root: Root;
function button(label: string) { const item = [...host.querySelectorAll('button')].find(x => x.textContent?.trim() === label); if (!item) throw new Error(label); return item; }
async function click(label: string) { await act(async () => button(label).click()); }
async function question(value: string) {
 const input = host.querySelector('textarea')!;
 await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
beforeEach(async () => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); mocks.ask.mockReset();
 host = document.createElement('div'); document.body.append(host); root = createRoot(host);
 await act(async () => root.render(<ExerciseCoach exercise={exercise} />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('exercise coach interactions', () => {
 it('answers from the current session without making an AI call', async () => {
  await click('Jakie tempo?'); expect(host.querySelector('[role="status"]')?.textContent).toContain('3-0-X-0');
  await click('Ile przerwy?'); expect(host.querySelector('[role="status"]')?.textContent).toContain('90 s');
  expect(mocks.ask).not.toHaveBeenCalled(); expect(exercise.reps).toBe('6');
 });
 it('answers knee-angle questions locally without inventing a universal squat depth', async () => {
  await click('Jaki kąt w kolanie?');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Nie ma jednego obowiązkowego kąta');
  expect(mocks.ask).not.toHaveBeenCalled();
 });
 it('requires a deliberate opt-in before the optional AI request', async () => {
  await question('Co oznacza rytm ruchu?'); expect(button('Zapytaj AI').disabled).toBe(true);
  await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  mocks.ask.mockResolvedValue({ source: 'ai', text: 'Sprawdź tempo w sesji.' });
  await click('Zapytaj AI'); expect(mocks.ask).toHaveBeenCalledTimes(1);
  expect(mocks.ask.mock.calls[0][0]).toBe('Co oznacza rytm ruchu?');
  expect(host.textContent).toContain('Sprawdź tempo w sesji.');
 });
 it('keeps dictated text editable and never sends it automatically', async () => {
  vi.useFakeTimers();
  type Instance = { onresult?: (event: unknown) => void; abort: ReturnType<typeof vi.fn> };
  const instances: Instance[]=[];
  class Recognition { lang=''; continuous=false; interimResults=false; onresult=undefined; onerror=undefined; onend=undefined; start=vi.fn(); stop=vi.fn(); abort=vi.fn(); constructor() { Object.assign(this, {}); instances.push(this); } }
  vi.stubGlobal('SpeechRecognition', Recognition);
  await click('Dyktuj'); const instance=instances[0];
  await act(async () => instance.onresult!({ results: [[{ transcript: 'Jak wolno opuszczać?' }]] }));
  expect(host.querySelector('textarea')!.value).toBe('Jak wolno opuszczać?'); expect(mocks.ask).not.toHaveBeenCalled();
  await act(async () => root.render(null)); expect(instance.abort).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
 });
 it('aborts a pending AI request and clears its timeout on closing', async () => {
  vi.useFakeTimers(); await question('Wyjaśnij to inaczej');
  await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  mocks.ask.mockImplementation(() => new Promise(() => {}));
  await click('Zapytaj AI'); const signal = mocks.ask.mock.calls[0][2] as AbortSignal;
  await act(async () => root.render(null)); expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
 });
 it('shows a local recording and revokes it on removal without an AI upload', async () => {
  const create = vi.fn(() => 'blob:local-technique'); const revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL { static createObjectURL=create; static revokeObjectURL=revoke; });
  const input=host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input,'files',{value:[new File(['video'], 'clip.mp4', {type:'video/mp4'})]});
  await act(async () => input.dispatchEvent(new Event('change',{bubbles:true})));
  expect(host.querySelector('video')?.getAttribute('src')).toBe('blob:local-technique');
  await click('Usuń film'); expect(revoke).toHaveBeenCalledWith('blob:local-technique');
  expect(mocks.ask).not.toHaveBeenCalled(); expect(host.querySelector('video')).toBeNull();
 });
});
