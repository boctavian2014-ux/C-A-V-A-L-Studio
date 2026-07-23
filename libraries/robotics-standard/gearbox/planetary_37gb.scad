module planetary_shell(od=37,h=28){
  difference(){
    cylinder(h=h,r=od/2,$fn=48);
    translate([0,0,2]) cylinder(h=h,r=od/2-2.5,$fn=48);
  }
}
planetary_shell();
