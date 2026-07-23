module spur_775_mount(){
  difference(){
    cube([50,42,4]);
    translate([25,21,-0.1]) cylinder(h=4.2,r=21,$fn=48);
  }
}
spur_775_mount();
