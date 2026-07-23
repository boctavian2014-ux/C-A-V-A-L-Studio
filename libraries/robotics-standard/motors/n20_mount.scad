module n20_mount(){
  difference(){
    cube([24,18,3]);
    translate([6,9,-0.1]) cylinder(h=3.2,r=1.1,$fn=16);
    translate([18,9,-0.1]) cylinder(h=3.2,r=1.1,$fn=16);
  }
}
n20_mount();
