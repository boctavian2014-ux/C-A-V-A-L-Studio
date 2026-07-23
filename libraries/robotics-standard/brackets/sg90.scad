module sg90_bracket(t=2.5){
  difference(){
    cube([32,12,t]);
    translate([4,6,-0.1]) cylinder(h=t+0.2,r=1.1,$fn=20);
    translate([28,6,-0.1]) cylinder(h=t+0.2,r=1.1,$fn=20);
  }
}
sg90_bracket();
