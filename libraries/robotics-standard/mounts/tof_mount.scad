module tof_mount(){
  difference(){
    cube([30,18,3]);
    translate([4,9,-0.1]) cylinder(h=3.2,r=1.2,$fn=20);
    translate([26,9,-0.1]) cylinder(h=3.2,r=1.2,$fn=20);
  }
}
tof_mount();
