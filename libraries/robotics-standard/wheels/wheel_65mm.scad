module wheel_65(d=65,w=20,hub=5){
  difference(){
    cylinder(h=w,r=d/2,$fn=64);
    translate([0,0,-0.1]) cylinder(h=w+0.2,r=hub,$fn=32);
  }
}
wheel_65();
