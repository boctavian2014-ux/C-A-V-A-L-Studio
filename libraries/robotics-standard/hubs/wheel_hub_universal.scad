module hub(){
  difference(){ cylinder(h=12,r=12,$fn=48); translate([0,0,-0.1]) cylinder(h=12.2,r=2.5,$fn=24); }
}
hub();
