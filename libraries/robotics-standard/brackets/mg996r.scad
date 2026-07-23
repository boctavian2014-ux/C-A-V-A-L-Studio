// MG996R servo bracket
module mg996r_bracket(t=3){
  difference(){
    cube([40,20,t]);
    translate([5,10,-0.1]) cylinder(h=t+0.2,r=1.6,$fn=24);
    translate([35,10,-0.1]) cylinder(h=t+0.2,r=1.6,$fn=24);
    translate([20,10,-0.1]) cylinder(h=t+0.2,r=3.5,$fn=32);
  }
}
mg996r_bracket();
