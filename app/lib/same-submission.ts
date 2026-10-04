import type {Case} from "./workflow";
export function sameSubmission(a:Case,b:Case):boolean{
 const identity=(c:Case)=>({id:c.id,name:c.name,age:c.age,barangay:c.barangay,screenedAt:c.screenedAt,readings:c.readings,screening:c.screening,phone:c.phone,history:c.history,documents:(c.documents||[]).map(d=>({id:d.id,name:d.name,mime:d.mime,addedAt:d.addedAt}))});
 return JSON.stringify(identity(a))===JSON.stringify(identity(b));
}
