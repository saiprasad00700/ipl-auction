export function validateRoomSettings({room,uid,settings}){
 if(!room||!uid)return {allowed:false,status:401,reason:'identity_required'};
 if(room.hostId!==uid)return {allowed:false,status:403,reason:'host_only'};
 if(!settings||typeof settings!=='object'||Array.isArray(settings))return {allowed:false,status:400,reason:'invalid_settings'};
 const allowedKeys=['bidTimer','budget'];
 if(Object.keys(settings).some(key=>!allowedKeys.includes(key)))return {allowed:false,status:400,reason:'unsupported_setting'};
 const merged={...(room.settings||{}),...settings};
 const bidTimer=Number(merged.bidTimer||15);
 if(![3,5,10,15].includes(bidTimer))return {allowed:false,status:400,reason:'invalid_bid_timer'};
 const budget=Number(merged.budget);
 const maximum=(room.auctionType==='sprint5'?60:room.auctionType==='sprint11'?90:120);
 if(!Number.isFinite(budget)||budget<=0||budget>maximum)return {allowed:false,status:400,reason:'invalid_budget'};
 return {allowed:true,status:200,settings:{...merged,bidTimer,budget}};
}
