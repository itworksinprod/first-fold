// Fixed development controls proposed by an independent reviewer before inference.
// Synthetic prose, not articles or a held-out generalization claim. Labels stay local.
import {createHash} from 'node:crypto';
const pair=(source,positive,negative,reason,negativeSpans)=>({source,positive,negative,reason,negativeSpans});
const pairs=[
  pair('The Bellweather station rejects readings outside its configured range. It logs the rejected readings.',
    'The Bellweather station rejects readings outside its configured range and logs the rejected readings.',
    'Rejecting readings outside its configured range guarantees that every reading stored by the Bellweather station is accurate.',
    'Range rejection does not establish that every retained measurement is accurate.',['unsupported']),
  pair('The museum installed a light filter on Tuesday. Measured light exposure in the cabinet was lower on Wednesday. The measurements do not establish what caused the change.',
    'The museum installed a light filter on Tuesday, and measured light exposure in the cabinet was lower on Wednesday.',
    'The museum installed a light filter on Tuesday, thereby causing the lower light exposure measured in the cabinet on Wednesday.',
    'The temporal observations do not establish the asserted causal relationship.',['supported','unsupported']),
  pair('During the demonstration, the bell sounds only while the door is open. Closing the door silences the bell.',
    'During the demonstration, the bell sounds only while the door is open; closing the door silences it.',
    'During the demonstration, the bell sounds while the door is open and continues sounding after the door closes.',
    'Continued sounding after closure contradicts the stated operating condition.',['supported','supported','unsupported']),
  pair('Oak Hall has six meeting rooms. Its pilot covered two rooms. Staff recorded temperatures only in those two pilot rooms.',
    'Oak Hall has six meeting rooms, but its pilot covered two and staff recorded temperatures only in those two rooms.',
    'Oak Hall’s pilot covered two meeting rooms, and staff recorded temperatures in all six rooms.',
    'The measurement scope is broadened from two pilot rooms to all six rooms.',['supported','unsupported']),
];
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export const SPAN_SOURCE_CONTROLS=freeze(pairs.flatMap((p,i)=>[true,false].map((supported,j)=>({
  id:`SC${String(i*2+j+1).padStart(2,'0')}`,expectedSupported:supported,
  expectedVerdicts:supported?Array(i<2?2:3).fill('supported'):p.negativeSpans,
  rationale:supported?'All stated assertions and relationships follow from the complete source.':p.reason,
  input:{text:supported?p.positive:p.negative,sources:[{publisher:'Fictional calibration source',
    passages:[{evidenceId:'S1P1',text:p.source}]}]},
}))));
export const SPAN_SOURCE_CONTROLSET_SHA256=createHash('sha256').update(JSON.stringify(SPAN_SOURCE_CONTROLS)).digest('hex');
