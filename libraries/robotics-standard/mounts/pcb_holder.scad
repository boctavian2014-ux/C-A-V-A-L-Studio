module pcb_holder(w=70,d=50,t=2){
  difference(){
    cube([w+6,d+6,t+4]);
    translate([3,3,t]) cube([w,d,5]);
  }
}
pcb_holder();
