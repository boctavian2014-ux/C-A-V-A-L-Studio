module wheel_80(d=80,w=22,hub=5){
  difference(){
    cylinder(h=w,r=d/2,$fn=72);
    translate([0,0,-0.1]) cylinder(h=w+0.2,r=hub,$fn=32);
  }
}
wheel_80();
