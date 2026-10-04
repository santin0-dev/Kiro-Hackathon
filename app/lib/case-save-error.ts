export function caseSaveError(error:{code?:string;message?:string;details?:string}|null):string {
 if(!error)return "Another user changed this case. Refresh and try again.";
 if(error.code==="23505"){
  const constraint=`${error.message||""} ${error.details||""}`;
  if(constraint.includes("vitality_slot_unique"))return "That appointment time is already booked for another patient. Refresh and choose another time.";
  if(constraint.includes("vitality_cases_pkey"))return "This case ID already exists. Close this form and create a new screening.";
  return "The database rejected a duplicate value. The record was not saved.";
 }
 return "The database could not save this case. Check the connection and retry.";
}
