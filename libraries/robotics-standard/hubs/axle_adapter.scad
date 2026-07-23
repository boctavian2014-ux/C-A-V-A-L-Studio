module axle(){
  difference(){ cylinder(h=20,r=6,$fn=32); translate([0,0,-0.1]) cylinder(h=20.2,r=2.5,$fn=20); }
}
axle();
