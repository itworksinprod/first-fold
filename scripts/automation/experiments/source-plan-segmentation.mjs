// Frozen copy of the legacy catalog's conservative segmentation. Kept isolated
// so historical review contracts retain their byte-pinned implementation.
// Parity tests compare this entire algorithm with the unchanged legacy block.
const letter=x=>x!==undefined&&/[\p{L}\p{M}]/u.test(x);
// Generic, conservative English punctuation handling, not a grammatical parser.
// Ambiguity joins context rather than cutting a potentially incomplete sentence.
const abbreviations=new Set(['mr','mrs','ms','dr','prof','sr','jr','st','lt','gen','col','sgt','capt','cmdr','adm',
  'gov','sen','rep','fr','hon','pres','supt','esq','vs','etc','eg','ie',
  'approx','dept','fig','no','vol','rev','inc','ltd','co','corp','phd','am','pm',
  'jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec']);
const pairs=new Map([['(',')'],['[',']'],['{','}'],['“','”'],['‘','’'],['«','»'],['「','」'],['『','』'],['（','）']]);
const closers=new Set(pairs.values());
const terminals=new Set(['.','!','?','。','！','？']);

function track(text,i,stack){
  const ch=text[i],prev=text[i-1],next=text[i+1];
  if((ch==='\''||ch==='’')&&letter(prev)&&letter(next))return true; // contraction
  if(ch==='"'||ch==='\''){
    if(stack.at(-1)===ch){stack.pop();return true;}
    if(ch==='\''&&letter(prev))return true; // possessive apostrophe
    stack.push(ch);return true;
  }
  if(pairs.has(ch)){stack.push(pairs.get(ch));return true;}
  if(closers.has(ch)){
    if(ch==='’'&&letter(prev)&&stack.at(-1)!=='’')return true; // possessive
    if(stack.at(-1)!==ch)return false;
    stack.pop();
  }
  return true;
}

function ambiguousPeriod(text,i){
  if(text[i]!=='.')return false;
  if(text[i-1]==='.'||text[i+1]==='.')return true; // ellipsis
  const word=text.slice(0,i).match(/([\p{L}\p{M}\d.]+)$/u)?.[1]??'';
  return /^\p{L}\p{M}*$/u.test(word)||/^(?:\p{L}\p{M}*\.)+\p{L}\p{M}*$/u.test(word)||
    abbreviations.has(word.toLowerCase().replaceAll('.',''));
}

function segments(text){
  const cuts=[],stack=[];let start=0,balanced=true;
  for(let i=0;i<text.length;i++){
    balanced=track(text,i,stack)&&balanced;
    if(!terminals.has(text[i])||ambiguousPeriod(text,i))continue;
    let end=i+1;
    while(terminals.has(text[end]))end++;
    const look=[...stack];let closed=balanced;
    while(closers.has(text[end])||text[end]==='"'||text[end]==='\''){
      closed=track(text,end,look)&&closed;end++;
    }
    if(!closed||look.length||end<text.length&&!/\s/u.test(text[end]))continue;
    const next=text.slice(end).trimStart();
    // A lower-case/numeric continuation can belong to an abbreviation or quote.
    if(next&&/^[\p{Ll}\d]/u.test(next))continue;
    cuts.push({start,end,reason:null});start=end;i=end-1;stack.length=0;
  }
  if(start<text.length)cuts.push({start,end:text.length,reason:balanced&&!stack.length?'unterminated':'unbalanced'});
  return cuts.map(s=>{
    while(s.start<s.end&&/\s/u.test(text[s.start]))s.start++;
    while(s.end>s.start&&/\s/u.test(text[s.end-1]))s.end--;
    const length=s.end-s.start;
    return {...s,reason:s.reason??(length<8?'too-short':length>400?'too-long':null)};
  }).filter(s=>s.end>s.start);
}


export function sourceSentenceSegments(text){
  if(typeof text!=='string'||!text.length||text.length>6000||/[\uD800-\uDFFF]/u.test(text))throw Object.assign(new Error('SOURCE_SENTENCE_INPUT'),{code:'SOURCE_SENTENCE_INPUT'});
  return Object.freeze(segments(text).map(Object.freeze));
}

