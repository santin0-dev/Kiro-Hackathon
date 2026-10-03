import {NextResponse,type NextRequest} from "next/server";
import {allowLocalRequest} from "./app/lib/request-origin";
export function proxy(request:NextRequest){if(!allowLocalRequest(request))return new NextResponse("Use the configured app URL.",{status:403,headers:{"Cache-Control":"no-store"}});return NextResponse.next();}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
