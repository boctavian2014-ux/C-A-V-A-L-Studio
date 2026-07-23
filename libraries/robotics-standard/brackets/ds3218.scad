module ds3218_bracket(t=3.5){
  difference(){
    cube([54,24,t]);
    translate([6,12,-0.1]) cylinder(h=t+0.2,r=1.8,$fn=24);
    translate([48,12,-0.1]) cylinder(h=t+0.2,r=1.8,$fn=24);
  }
}
ds3218_bracket();
