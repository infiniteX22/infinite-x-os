const ONES=["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

function wholeNumberWords(value){
  const n=Math.max(0,Math.trunc(Number(value)||0));
  if(n<20)return ONES[n];
  if(n<100)return`${TENS[Math.floor(n/10)]}${n%10?`-${ONES[n%10]}`:""}`;
  if(n<1000)return`${ONES[Math.floor(n/100)]} hundred${n%100?` ${wholeNumberWords(n%100)}`:""}`;
  for(const [size,label] of [[1_000_000_000,"billion"],[1_000_000,"million"],[1_000,"thousand"]])if(n>=size)return`${wholeNumberWords(Math.floor(n/size))} ${label}${n%size?` ${wholeNumberWords(n%size)}`:""}`;
  return String(n);
}

export function speechRand(cents){
  const safe=Math.max(0,Math.round(Number(cents)||0)),rand=Math.floor(safe/100),remainder=safe%100,parts=[];
  if(rand||!remainder)parts.push(`${wholeNumberWords(rand)} ${rand===1?"rand":"rand"}`);
  if(remainder)parts.push(`${wholeNumberWords(remainder)} ${remainder===1?"cent":"cents"}`);
  return parts.join(" and ");
}
