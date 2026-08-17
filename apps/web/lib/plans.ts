export type StepType='ONE_STEP'|'TWO_STEP'
export type Plan={id:string;balance:number;stepType:StepType;price:number;regularPrice:number;targets:number[];dailyLoss:number;staticLoss:number;rewardSplit:number}
const data=[[5000,29,49,39,59],[10000,49,69,59,79],[25000,99,139,119,159],[50000,179,229,209,269],[100000,299,399,349,449]]
export const plans:Plan[]=data.flatMap(([balance,one,oneRegular,two,twoRegular])=>[
 {id:`one-step-${balance/1000}k`,balance,stepType:'ONE_STEP',price:one,regularPrice:oneRegular,targets:[8],dailyLoss:3,staticLoss:6,rewardSplit:80},
 {id:`two-step-${balance/1000}k`,balance,stepType:'TWO_STEP',price:two,regularPrice:twoRegular,targets:[8,5],dailyLoss:3,staticLoss:8,rewardSplit:90}
])
export const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
export const staticFloor=(n:number,lossPct=6)=>n*(1-lossPct/100)
export const dailyFloor=(n:number)=>n*0.97
